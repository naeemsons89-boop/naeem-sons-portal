export type AppRole =
  | "admin"
  | "warehouse_manager"
  | "warehouse_operator"
  | "sales_office"
  | "viewer";

export type UserStatus = "pending" | "approved" | "rejected" | "suspended";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: AppRole | null;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Loose typing until generated types are pulled from Supabase */
export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      }
    >;
    Views: Record<
      string,
      {
        Row: Record<string, unknown>;
        Relationships: [];
      }
    >;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      user_status: UserStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
