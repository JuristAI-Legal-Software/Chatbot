import type { IUser } from '@librechat/data-schemas';

declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
  }
}
