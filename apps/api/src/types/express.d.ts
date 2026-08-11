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
        impersonationSessionId?: string;
      };
      customer?: {
        id: string;
        storeId: string;
        phone: string;
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
