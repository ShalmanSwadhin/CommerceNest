import type { UserRole } from '@commercenest/types';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        role: UserRole;
        storeId: string | null;
        email: string;
        name: string;
        phone: string | null;
        emailVerified: boolean;
        phoneVerified: boolean;
        impersonationSessionId?: string;
      };
      customer?: {
        id: string;
        storeId: string;
        phone: string | null;
        name: string;
        email: string | null;
      };
      storeId?: string;
      store?: {
        id: string;
        slug: string;
        name: string;
        status: string;
      };
    }
  }
}

export {};
