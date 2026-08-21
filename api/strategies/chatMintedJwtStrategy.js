const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { SystemRoles } = require('librechat-data-provider');
const { createUser, getUserById } = require('~/models');

/**
 * Authenticate the short-lived token minted by JuristAI's Django service.
 *
 * JuristAI owns signup and therefore a new user may not yet have a Mongo
 * User document in LibreChat. The token carries the stable Mongo-compatible
 * id and email; create that local identity on first use so the normal
 * LibreChat agent routes can resolve req.user.
 *
 * JuristAI signs the token with CHAT_SECRET, which is deployed as the same
 * value as JWT_SECRET. Falling back to JWT_SECRET keeps this strategy working
 * on task definitions that only carry JWT_SECRET, so provisioning does not
 * depend on a separate deploy-config change.
 */
// LibreChat's user schema requires `email` and validates it against
// /\S+@\S+\.\S+/. The brand-new signup this strategy exists to rescue is
// exactly the case where the token may NOT carry one: chat_proxy resolves the
// address from a UserTable GSI, and that index is eventually consistent, so
// seconds after signup the lookup misses and the token goes out with
// `email: null` and `username` set to the raw Cognito sub. Handing that to
// createUser throws a validation error, the strategy reports failure, and the
// user still gets a 401 — the very failure this provisioning path is meant to
// remove. Fall back to a deterministic address derived from the id so
// provisioning always succeeds; the real address replaces it the moment a token
// carrying one arrives.
const EMAIL_PATTERN = /\S+@\S+\.\S+/;
const PROVISIONAL_EMAIL_DOMAIN = 'chat.juristai.internal';

const resolveProvisioningEmail = (payload, id) => {
  const candidates = [payload?.email, payload?.username];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? '').trim().toLowerCase();
    if (normalized && EMAIL_PATTERN.test(normalized)) {
      return normalized;
    }
  }

  return `${id.toLowerCase()}@${PROVISIONAL_EMAIL_DOMAIN}`;
};

const chatMintedJwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.CHAT_SECRET || process.env.JWT_SECRET,
      algorithms: ['HS256'],
    },
    async (payload, done) => {
      try {
        // ActionService mints the stable user identifier as the standard JWT
        // `sub` claim. Keep accepting the legacy `id` claim for tokens issued
        // by older Chatbot callers while ensuring current action tokens can
        // provision and authenticate the intended user.
        const id = String(payload?.sub ?? payload?.id ?? '').trim();
        if (!id) {
          return done(null, false, { message: 'Invalid JuristAI chat token' });
        }

        const email = resolveProvisioningEmail(payload, id);

        let user = await getUserById(id, '-password -__v -totpSecret -backupCodes');
        if (!user) {
          user = await createUser(
            {
              _id: id,
              email,
              username: email,
              name: email,
              provider: 'local',
              role: SystemRoles.USER,
              emailVerified: true,
            },
            undefined,
            true,
            true,
          );
        }

        user.id = user._id?.toString?.() ?? id;
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    },
  );

module.exports = chatMintedJwtLogin;
