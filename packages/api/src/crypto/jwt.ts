import { sign, SignOptions } from 'jsonwebtoken';

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
 * @returns {String} - The generated JWT token
 */
export const generateShortLivedToken = (userId: string, expireIn = '5m'): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required to generate tokens');
  }

  const options: SignOptions = {
    expiresIn: expireIn,
    algorithm: 'HS256',
  };

  return sign({ id: userId }, secret, options);
};
