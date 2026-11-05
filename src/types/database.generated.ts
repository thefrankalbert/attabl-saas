export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_users: {
        Row: {
          ban_reason: string | null;
          banned_at: string | null;
          banned_by: string | null;
          created_at: string;
          created_by: string | null;
          custom_permissions: Json | null;
          deleted_at: string | null;
          deleted_by: string | null;
          email: string;
          full_name: string | null;
          id: string;
          is_active: boolean;
          is_super_admin: boolean | null;
          last_login: string | null;
          last_login_at: string | null;
          login_count: number | null;
          phone: string | null;
          role: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          ban_reason?: string | null;
          banned_at?: string | null;
          banned_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_permissions?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          is_super_admin?: boolean | null;
          last_login?: string | null;
          last_login_at?: string | null;
          login_count?: number | null;
          phone?: string | null;
          role?: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          ban_reason?: string | null;
          banned_at?: string | null;
          banned_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_permissions?: Json | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          is_active?: boolean;
          is_super_admin?: boolean | null;
          last_login?: string | null;
          last_login_at?: string | null;
          login_count?: number | null;
          phone?: string | null;
          role?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_users_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ads: {
        Row: {
          created_at: string;
          id: string;
          image_url: string;
          is_active: boolean;
          link: string | null;
          sort_order: number;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_url: string;
          is_active?: boolean;
          link?: string | null;
          sort_order?: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_url?: string;
          is_active?: boolean;
          link?: string | null;
          sort_order?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ads_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_credits_ledger: {
        Row: {
          created_at: string | null;
          delta: number;
          external_ref: string | null;
          id: string;
          menu_item_id: string | null;
          reason: string;
          tenant_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          delta: number;
          external_ref?: string | null;
          id?: string;
          menu_item_id?: string | null;
          reason: string;
          tenant_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          delta?: number;
          external_ref?: string | null;
          id?: string;
          menu_item_id?: string | null;
          reason?: string;
          tenant_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_credits_ledger_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_credits_ledger_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_photo_credits: {
        Row: {
          balance: number;
          last_grant_at: string | null;
          lifetime_used: number;
          monthly_grant: number;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          balance?: number;
          last_grant_at?: string | null;
          lifetime_used?: number;
          monthly_grant?: number;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          balance?: number;
          last_grant_at?: string | null;
          lifetime_used?: number;
          monthly_grant?: number;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_photo_credits_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      announcements: {
        Row: {
          created_at: string | null;
          description: string | null;
          description_en: string | null;
          end_date: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean | null;
          start_date: string;
          tenant_id: string;
          title: string;
          title_en: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          start_date?: string;
          tenant_id: string;
          title: string;
          title_en?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          end_date?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          start_date?: string;
          tenant_id?: string;
          title?: string;
          title_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'announcements_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json | null;
          new_data: Json | null;
          old_data: Json | null;
          tenant_id: string | null;
          user_email: string | null;
          user_id: string | null;
          user_role: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json | null;
          new_data?: Json | null;
          old_data?: Json | null;
          tenant_id?: string | null;
          user_email?: string | null;
          user_id?: string | null;
          user_role?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json | null;
          new_data?: Json | null;
          old_data?: Json | null;
          tenant_id?: string | null;
          user_email?: string | null;
          user_id?: string | null;
          user_role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          icon: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          is_featured_on_home: boolean;
          menu_id: string | null;
          name: string;
          name_en: string | null;
          preparation_zone: string;
          tenant_id: string;
          venue_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_featured_on_home?: boolean;
          menu_id?: string | null;
          name: string;
          name_en?: string | null;
          preparation_zone?: string;
          tenant_id: string;
          venue_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          is_featured_on_home?: boolean;
          menu_id?: string | null;
          name?: string;
          name_en?: string | null;
          preparation_zone?: string;
          tenant_id?: string;
          venue_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_menu_id_fkey';
            columns: ['menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categories_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'categories_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          coupon_id: string | null;
          created_at: string;
          discount_amount: number;
          id: string;
          order_id: string | null;
          tenant_id: string;
        };
        Insert: {
          coupon_id?: string | null;
          created_at?: string;
          discount_amount?: number;
          id?: string;
          order_id?: string | null;
          tenant_id: string;
        };
        Update: {
          coupon_id?: string | null;
          created_at?: string;
          discount_amount?: number;
          id?: string;
          order_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'coupon_redemptions_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coupon_redemptions_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coupon_redemptions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      coupons: {
        Row: {
          code: string;
          created_at: string | null;
          current_uses: number | null;
          discount_type: string;
          discount_value: number;
          id: string;
          is_active: boolean | null;
          max_discount_amount: number | null;
          max_uses: number | null;
          min_order_amount: number | null;
          tenant_id: string;
          updated_at: string | null;
          valid_from: string | null;
          valid_until: string | null;
        };
        Insert: {
          code: string;
          created_at?: string | null;
          current_uses?: number | null;
          discount_type: string;
          discount_value: number;
          id?: string;
          is_active?: boolean | null;
          max_discount_amount?: number | null;
          max_uses?: number | null;
          min_order_amount?: number | null;
          tenant_id: string;
          updated_at?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Update: {
          code?: string;
          created_at?: string | null;
          current_uses?: number | null;
          discount_type?: string;
          discount_value?: number;
          id?: string;
          is_active?: boolean | null;
          max_discount_amount?: number | null;
          max_uses?: number | null;
          min_order_amount?: number | null;
          tenant_id?: string;
          updated_at?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'coupons_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      dish_photo_drafts: {
        Row: {
          attached_menu_item_id: string | null;
          created_at: string | null;
          created_by: string;
          device_id: string | null;
          exif_taken_at: string | null;
          id: string;
          public_url: string | null;
          status: string;
          storage_path: string;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          attached_menu_item_id?: string | null;
          created_at?: string | null;
          created_by: string;
          device_id?: string | null;
          exif_taken_at?: string | null;
          id?: string;
          public_url?: string | null;
          status?: string;
          storage_path: string;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          attached_menu_item_id?: string | null;
          created_at?: string | null;
          created_by?: string;
          device_id?: string | null;
          exif_taken_at?: string | null;
          id?: string;
          public_url?: string | null;
          status?: string;
          storage_path?: string;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'dish_photo_drafts_attached_menu_item_id_fkey';
            columns: ['attached_menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dish_photo_drafts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      house_accounts: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          settled_at: string | null;
          settled_by: string | null;
          status: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          settled_at?: string | null;
          settled_by?: string | null;
          status?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          settled_at?: string | null;
          settled_by?: string | null;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'house_accounts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_accounts_settled_by_fkey';
            columns: ['settled_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'house_accounts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ingredients: {
        Row: {
          category: string | null;
          cost_per_unit: number;
          created_at: string;
          current_stock: number;
          id: string;
          is_active: boolean;
          min_stock_alert: number;
          name: string;
          purchase_unit: string | null;
          tenant_id: string;
          unit: string;
          units_per_purchase: number;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          cost_per_unit?: number;
          created_at?: string;
          current_stock?: number;
          id?: string;
          is_active?: boolean;
          min_stock_alert?: number;
          name: string;
          purchase_unit?: string | null;
          tenant_id: string;
          unit?: string;
          units_per_purchase?: number;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          cost_per_unit?: number;
          created_at?: string;
          current_stock?: number;
          id?: string;
          is_active?: boolean;
          min_stock_alert?: number;
          name?: string;
          purchase_unit?: string | null;
          tenant_id?: string;
          unit?: string;
          units_per_purchase?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingredients_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          custom_permissions: Json | null;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          role: string;
          status: string;
          tenant_id: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          custom_permissions?: Json | null;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          role: string;
          status?: string;
          tenant_id: string;
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          custom_permissions?: Json | null;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          role?: string;
          status?: string;
          tenant_id?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      item_modifiers: {
        Row: {
          created_at: string | null;
          display_order: number | null;
          id: string;
          is_available: boolean | null;
          menu_item_id: string;
          name: string;
          name_en: string | null;
          price: number | null;
          prices: Json | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          display_order?: number | null;
          id?: string;
          is_available?: boolean | null;
          menu_item_id: string;
          name: string;
          name_en?: string | null;
          price?: number | null;
          prices?: Json | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          display_order?: number | null;
          id?: string;
          is_available?: boolean | null;
          menu_item_id?: string;
          name?: string;
          name_en?: string | null;
          price?: number | null;
          prices?: Json | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'item_modifiers_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_modifiers_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      item_options: {
        Row: {
          created_at: string | null;
          display_order: number;
          id: string;
          is_default: boolean;
          menu_item_id: string;
          name_en: string | null;
          name_fr: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string | null;
          display_order?: number;
          id?: string;
          is_default?: boolean;
          menu_item_id: string;
          name_en?: string | null;
          name_fr: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string | null;
          display_order?: number;
          id?: string;
          is_default?: boolean;
          menu_item_id?: string;
          name_en?: string | null;
          name_fr?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_options_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_options_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      item_price_variants: {
        Row: {
          created_at: string | null;
          id: string;
          menu_item_id: string;
          price: number;
          prices: Json | null;
          sort_order: number | null;
          tenant_id: string;
          updated_at: string | null;
          variant_name_en: string | null;
          variant_name_fr: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          menu_item_id: string;
          price?: number;
          prices?: Json | null;
          sort_order?: number | null;
          tenant_id: string;
          updated_at?: string | null;
          variant_name_en?: string | null;
          variant_name_fr: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          menu_item_id?: string;
          price?: number;
          prices?: Json | null;
          sort_order?: number | null;
          tenant_id?: string;
          updated_at?: string | null;
          variant_name_en?: string | null;
          variant_name_fr?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_price_variants_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_price_variants_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      item_suggestions: {
        Row: {
          created_at: string;
          description: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          menu_item_id: string;
          suggested_item_id: string;
          suggestion_type: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          menu_item_id: string;
          suggested_item_id: string;
          suggestion_type?: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          menu_item_id?: string;
          suggested_item_id?: string;
          suggestion_type?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'item_suggestions_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_suggestions_suggested_item_id_fkey';
            columns: ['suggested_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'item_suggestions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      menu_items: {
        Row: {
          allergens: string[] | null;
          calories: number | null;
          category_id: string;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          description_en: string | null;
          favorite_count: number;
          id: string;
          image_ai_processed: boolean | null;
          image_source: string | null;
          image_uploaded_at: string | null;
          image_uploaded_by: string | null;
          image_url: string | null;
          images: Json;
          is_available: boolean;
          is_featured: boolean;
          is_spicy: boolean;
          is_vegetarian: boolean;
          name: string;
          name_en: string | null;
          options_title_en: string | null;
          options_title_fr: string | null;
          price: number;
          prices: Json | null;
          rating: number | null;
          rating_count: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          allergens?: string[] | null;
          calories?: number | null;
          category_id: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          favorite_count?: number;
          id?: string;
          image_ai_processed?: boolean | null;
          image_source?: string | null;
          image_uploaded_at?: string | null;
          image_uploaded_by?: string | null;
          image_url?: string | null;
          images?: Json;
          is_available?: boolean;
          is_featured?: boolean;
          is_spicy?: boolean;
          is_vegetarian?: boolean;
          name: string;
          name_en?: string | null;
          options_title_en?: string | null;
          options_title_fr?: string | null;
          price: number;
          prices?: Json | null;
          rating?: number | null;
          rating_count?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          allergens?: string[] | null;
          calories?: number | null;
          category_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          favorite_count?: number;
          id?: string;
          image_ai_processed?: boolean | null;
          image_source?: string | null;
          image_uploaded_at?: string | null;
          image_uploaded_by?: string | null;
          image_url?: string | null;
          images?: Json;
          is_available?: boolean;
          is_featured?: boolean;
          is_spicy?: boolean;
          is_vegetarian?: boolean;
          name?: string;
          name_en?: string | null;
          options_title_en?: string | null;
          options_title_fr?: string | null;
          price?: number;
          prices?: Json | null;
          rating?: number | null;
          rating_count?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'menu_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'menu_items_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      menus: {
        Row: {
          created_at: string | null;
          description: string | null;
          description_en: string | null;
          display_order: number | null;
          id: string;
          image_url: string | null;
          is_active: boolean | null;
          is_transversal_menu: boolean;
          name: string;
          name_en: string | null;
          parent_menu_id: string | null;
          slug: string;
          tenant_id: string;
          updated_at: string | null;
          venue_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          display_order?: number | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          is_transversal_menu?: boolean;
          name: string;
          name_en?: string | null;
          parent_menu_id?: string | null;
          slug: string;
          tenant_id: string;
          updated_at?: string | null;
          venue_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          description_en?: string | null;
          display_order?: number | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          is_transversal_menu?: boolean;
          name?: string;
          name_en?: string | null;
          parent_menu_id?: string | null;
          slug?: string;
          tenant_id?: string;
          updated_at?: string | null;
          venue_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'menus_parent_menu_id_fkey';
            columns: ['parent_menu_id'];
            isOneToOne: false;
            referencedRelation: 'menus';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'menus_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'menus_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      newsletter_subscriber: {
        Row: {
          created_at: string;
          email: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link: string | null;
          read: boolean;
          tenant_id: string;
          title: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean;
          tenant_id: string;
          title: string;
          type?: string;
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link?: string | null;
          read?: boolean;
          tenant_id?: string;
          title?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      onboarding_progress: {
        Row: {
          completed: boolean | null;
          completed_at: string | null;
          created_at: string | null;
          draft: Json | null;
          step: number | null;
          tenant_id: string;
          updated_at: string | null;
        };
        Insert: {
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          draft?: Json | null;
          step?: number | null;
          tenant_id: string;
          updated_at?: string | null;
        };
        Update: {
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          draft?: Json | null;
          step?: number | null;
          tenant_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_progress_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: true;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      orange_money_events: {
        Row: {
          id: string;
          processed_at: string;
          status: string;
        };
        Insert: {
          id: string;
          processed_at?: string;
          status: string;
        };
        Update: {
          id?: string;
          processed_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          course: string | null;
          created_at: string;
          customer_notes: string | null;
          fired_at: string | null;
          held: boolean;
          id: string;
          item_name: string;
          item_name_en: string | null;
          item_status: string | null;
          menu_item_id: string;
          modifiers: Json | null;
          order_id: string;
          preparation_zone: string;
          price_at_order: number;
          quantity: number;
          selected_option: Json | null;
          selected_variant: Json | null;
          tenant_id: string;
        };
        Insert: {
          course?: string | null;
          created_at?: string;
          customer_notes?: string | null;
          fired_at?: string | null;
          held?: boolean;
          id?: string;
          item_name: string;
          item_name_en?: string | null;
          item_status?: string | null;
          menu_item_id: string;
          modifiers?: Json | null;
          order_id: string;
          preparation_zone?: string;
          price_at_order: number;
          quantity?: number;
          selected_option?: Json | null;
          selected_variant?: Json | null;
          tenant_id: string;
        };
        Update: {
          course?: string | null;
          created_at?: string;
          customer_notes?: string | null;
          fired_at?: string | null;
          held?: boolean;
          id?: string;
          item_name?: string;
          item_name_en?: string | null;
          item_status?: string | null;
          menu_item_id?: string;
          modifiers?: Json | null;
          order_id?: string;
          preparation_zone?: string;
          price_at_order?: number;
          quantity?: number;
          selected_option?: Json | null;
          selected_variant?: Json | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_items_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      order_mutation_requests: {
        Row: {
          client_request_id: string;
          created_at: string;
          processed_at: string | null;
          tenant_id: string;
        };
        Insert: {
          client_request_id: string;
          created_at?: string;
          processed_at?: string | null;
          tenant_id: string;
        };
        Update: {
          client_request_id?: string;
          created_at?: string;
          processed_at?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_mutation_requests_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      order_notes: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          note: string;
          order_id: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note: string;
          order_id: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string;
          order_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_notes_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_notes_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'order_notes_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          assigned_to: string | null;
          cashier_id: string | null;
          client_request_id: string | null;
          comp_amount: number | null;
          comp_reason: string | null;
          comped_at: string | null;
          comped_by: string | null;
          completed_at: string | null;
          coupon_id: string | null;
          created_at: string;
          customer_name: string | null;
          customer_phone: string | null;
          delivery_address: string | null;
          discount_amount: number | null;
          display_currency: string | null;
          house_account_id: string | null;
          id: string;
          is_comp: boolean;
          notes: string | null;
          orange_money_notif_token: string | null;
          orange_money_pay_token: string | null;
          order_number: string;
          paid_at: string | null;
          payment_initiated_at: string | null;
          payment_method: string | null;
          payment_status: string | null;
          preparation_zone: string;
          room_number: string | null;
          served_at: string | null;
          server_id: string | null;
          service_charge_amount: number | null;
          service_type: string | null;
          session_id: string | null;
          status: string;
          subtotal: number;
          table_id: string | null;
          table_number: string | null;
          tax_amount: number | null;
          tenant_id: string;
          tip_amount: number | null;
          total: number;
          updated_at: string;
          venue_id: string | null;
          wave_checkout_id: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          cashier_id?: string | null;
          client_request_id?: string | null;
          comp_amount?: number | null;
          comp_reason?: string | null;
          comped_at?: string | null;
          comped_by?: string | null;
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          discount_amount?: number | null;
          display_currency?: string | null;
          house_account_id?: string | null;
          id?: string;
          is_comp?: boolean;
          notes?: string | null;
          orange_money_notif_token?: string | null;
          orange_money_pay_token?: string | null;
          order_number: string;
          paid_at?: string | null;
          payment_initiated_at?: string | null;
          payment_method?: string | null;
          payment_status?: string | null;
          preparation_zone?: string;
          room_number?: string | null;
          served_at?: string | null;
          server_id?: string | null;
          service_charge_amount?: number | null;
          service_type?: string | null;
          session_id?: string | null;
          status?: string;
          subtotal: number;
          table_id?: string | null;
          table_number?: string | null;
          tax_amount?: number | null;
          tenant_id: string;
          tip_amount?: number | null;
          total: number;
          updated_at?: string;
          venue_id?: string | null;
          wave_checkout_id?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          cashier_id?: string | null;
          client_request_id?: string | null;
          comp_amount?: number | null;
          comp_reason?: string | null;
          comped_at?: string | null;
          comped_by?: string | null;
          completed_at?: string | null;
          coupon_id?: string | null;
          created_at?: string;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          discount_amount?: number | null;
          display_currency?: string | null;
          house_account_id?: string | null;
          id?: string;
          is_comp?: boolean;
          notes?: string | null;
          orange_money_notif_token?: string | null;
          orange_money_pay_token?: string | null;
          order_number?: string;
          paid_at?: string | null;
          payment_initiated_at?: string | null;
          payment_method?: string | null;
          payment_status?: string | null;
          preparation_zone?: string;
          room_number?: string | null;
          served_at?: string | null;
          server_id?: string | null;
          service_charge_amount?: number | null;
          service_type?: string | null;
          session_id?: string | null;
          status?: string;
          subtotal?: number;
          table_id?: string | null;
          table_number?: string | null;
          tax_amount?: number | null;
          tenant_id?: string;
          tip_amount?: number | null;
          total?: number;
          updated_at?: string;
          venue_id?: string | null;
          wave_checkout_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'orders_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_cashier_id_fkey';
            columns: ['cashier_id'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_comped_by_fkey';
            columns: ['comped_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_coupon_id_fkey';
            columns: ['coupon_id'];
            isOneToOne: false;
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_house_account_id_fkey';
            columns: ['house_account_id'];
            isOneToOne: false;
            referencedRelation: 'house_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_server_id_fkey';
            columns: ['server_id'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'table_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          client_request_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          method: string;
          order_id: string;
          status: string;
          tenant_id: string;
        };
        Insert: {
          amount: number;
          client_request_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method: string;
          order_id: string;
          status?: string;
          tenant_id: string;
        };
        Update: {
          amount?: number;
          client_request_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          method?: string;
          order_id?: string;
          status?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_audit_log: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          metadata: Json | null;
          reason: string | null;
          target_id: string | null;
          target_label: string | null;
          target_type: string;
          tenant_id: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          reason?: string | null;
          target_id?: string | null;
          target_label?: string | null;
          target_type: string;
          tenant_id?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          reason?: string | null;
          target_id?: string | null;
          target_label?: string | null;
          target_type?: string;
          tenant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_audit_log_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          tenant_id: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          tenant_id: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          tenant_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      qr_designs: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          config: Json;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'qr_designs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          ingredient_id: string;
          menu_item_id: string;
          notes: string | null;
          quantity_needed: number;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ingredient_id: string;
          menu_item_id: string;
          notes?: string | null;
          quantity_needed: number;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          menu_item_id?: string;
          notes?: string | null;
          quantity_needed?: number;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recipes_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipes_menu_item_id_fkey';
            columns: ['menu_item_id'];
            isOneToOne: false;
            referencedRelation: 'menu_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recipes_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      restaurant_groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_user_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_user_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_user_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          id: string;
          permissions: Json;
          role: string;
          tenant_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          permissions?: Json;
          role: string;
          tenant_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          permissions?: Json;
          role?: string;
          tenant_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_permissions_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
        ];
      };
      settings: {
        Row: {
          id: string;
          key: string;
          tenant_id: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          id?: string;
          key: string;
          tenant_id: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          id?: string;
          key?: string;
          tenant_id?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'settings_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_alert_notifications: {
        Row: {
          alert_type: string;
          id: string;
          ingredient_id: string;
          sent_at: string;
          sent_to: string[];
          tenant_id: string;
        };
        Insert: {
          alert_type: string;
          id?: string;
          ingredient_id: string;
          sent_at?: string;
          sent_to: string[];
          tenant_id: string;
        };
        Update: {
          alert_type?: string;
          id?: string;
          ingredient_id?: string;
          sent_at?: string;
          sent_to?: string[];
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_alert_notifications_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_alert_notifications_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_count_lines: {
        Row: {
          count_id: string;
          counted_qty: number | null;
          created_at: string;
          id: string;
          ingredient_id: string;
          tenant_id: string;
          theoretical_qty: number;
          variance: number | null;
        };
        Insert: {
          count_id: string;
          counted_qty?: number | null;
          created_at?: string;
          id?: string;
          ingredient_id: string;
          tenant_id: string;
          theoretical_qty?: number;
          variance?: number | null;
        };
        Update: {
          count_id?: string;
          counted_qty?: number | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          tenant_id?: string;
          theoretical_qty?: number;
          variance?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_count_lines_count_id_fkey';
            columns: ['count_id'];
            isOneToOne: false;
            referencedRelation: 'stock_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_count_lines_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_count_lines_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_counts: {
        Row: {
          committed_at: string | null;
          committed_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          reference: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          committed_at?: string | null;
          committed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reference?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          committed_at?: string | null;
          committed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reference?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_counts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stock_movements: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          ingredient_id: string;
          movement_type: string;
          notes: string | null;
          quantity: number;
          reason_code: string | null;
          reference_id: string | null;
          supplier_id: string | null;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ingredient_id: string;
          movement_type: string;
          notes?: string | null;
          quantity: number;
          reason_code?: string | null;
          reference_id?: string | null;
          supplier_id?: string | null;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          ingredient_id?: string;
          movement_type?: string;
          notes?: string | null;
          quantity?: number;
          reason_code?: string | null;
          reference_id?: string | null;
          supplier_id?: string | null;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_movements_ingredient_id_fkey';
            columns: ['ingredient_id'];
            isOneToOne: false;
            referencedRelation: 'ingredients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_movements_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_events: {
        Row: {
          id: string;
          processed_at: string;
          stripe_created_at: string | null;
          type: string;
        };
        Insert: {
          id: string;
          processed_at?: string;
          stripe_created_at?: string | null;
          type: string;
        };
        Update: {
          id?: string;
          processed_at?: string;
          stripe_created_at?: string | null;
          type?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          address: string | null;
          contact_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          is_active: boolean;
          name: string;
          notes: string | null;
          phone: string | null;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          contact_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'suppliers_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      table_assignments: {
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          server_id: string;
          started_at: string;
          table_id: string;
          tenant_id: string;
        };
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          server_id: string;
          started_at?: string;
          table_id: string;
          tenant_id: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          server_id?: string;
          started_at?: string;
          table_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'table_assignments_server_id_fkey';
            columns: ['server_id'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'table_assignments_table_id_fkey';
            columns: ['table_id'];
            isOneToOne: false;
            referencedRelation: 'tables';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'table_assignments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      table_sessions: {
        Row: {
          closed_at: string | null;
          id: string;
          opened_at: string;
          status: string;
          table_number: string;
          tenant_id: string;
        };
        Insert: {
          closed_at?: string | null;
          id?: string;
          opened_at?: string;
          status?: string;
          table_number: string;
          tenant_id: string;
        };
        Update: {
          closed_at?: string | null;
          id?: string;
          opened_at?: string;
          status?: string;
          table_number?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'table_sessions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tables: {
        Row: {
          capacity: number;
          created_at: string | null;
          display_name: string;
          id: string;
          is_active: boolean | null;
          qr_code_url: string | null;
          qr_design_id: string | null;
          table_number: string;
          tenant_id: string;
          zone_id: string;
        };
        Insert: {
          capacity?: number;
          created_at?: string | null;
          display_name: string;
          id?: string;
          is_active?: boolean | null;
          qr_code_url?: string | null;
          qr_design_id?: string | null;
          table_number: string;
          tenant_id: string;
          zone_id: string;
        };
        Update: {
          capacity?: number;
          created_at?: string | null;
          display_name?: string;
          id?: string;
          is_active?: boolean | null;
          qr_code_url?: string | null;
          qr_design_id?: string | null;
          table_number?: string;
          tenant_id?: string;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tables_qr_design_id_fkey';
            columns: ['qr_design_id'];
            isOneToOne: false;
            referencedRelation: 'qr_designs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tables_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tables_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zones';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_supports: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          tenant_id: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          tenant_id: string;
          type?: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          tenant_id?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_supports_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenants: {
        Row: {
          activation_events: Json;
          address: string | null;
          at_food_enabled: boolean | null;
          banner_url: string | null;
          bar_display_enabled: boolean;
          billing_interval: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          currency: string | null;
          custom_domain: string | null;
          default_locale: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          enable_coupons: boolean | null;
          enable_service_charge: boolean | null;
          enable_tax: boolean | null;
          enabled_payment_methods: string[];
          establishment_type: string | null;
          freeze_reason: string | null;
          group_id: string | null;
          id: string;
          idle_timeout_minutes: number | null;
          is_active: boolean;
          last_active_at: string | null;
          logo_url: string | null;
          max_admins: number;
          max_menu_items: number;
          max_venues: number;
          name: string;
          notification_sound_id: string | null;
          onboarding_completed: boolean | null;
          onboarding_completed_at: string | null;
          opening_hours: Json;
          past_due_since: string | null;
          phone: string | null;
          primary_color: string | null;
          screen_lock_mode: string | null;
          secondary_color: string | null;
          service_charge_rate: number | null;
          slug: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_current_period_end: string | null;
          subscription_current_period_start: string | null;
          subscription_plan: string;
          subscription_status: string;
          supported_currencies: string[];
          suspend_reason: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          table_count: number | null;
          tax_rate: number | null;
          trial_ends_at: string | null;
          updated_at: string;
        };
        Insert: {
          activation_events?: Json;
          address?: string | null;
          at_food_enabled?: boolean | null;
          banner_url?: string | null;
          bar_display_enabled?: boolean;
          billing_interval?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          currency?: string | null;
          custom_domain?: string | null;
          default_locale?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          enable_coupons?: boolean | null;
          enable_service_charge?: boolean | null;
          enable_tax?: boolean | null;
          enabled_payment_methods?: string[];
          establishment_type?: string | null;
          freeze_reason?: string | null;
          group_id?: string | null;
          id?: string;
          idle_timeout_minutes?: number | null;
          is_active?: boolean;
          last_active_at?: string | null;
          logo_url?: string | null;
          max_admins?: number;
          max_menu_items?: number;
          max_venues?: number;
          name: string;
          notification_sound_id?: string | null;
          onboarding_completed?: boolean | null;
          onboarding_completed_at?: string | null;
          opening_hours?: Json;
          past_due_since?: string | null;
          phone?: string | null;
          primary_color?: string | null;
          screen_lock_mode?: string | null;
          secondary_color?: string | null;
          service_charge_rate?: number | null;
          slug: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_current_period_end?: string | null;
          subscription_current_period_start?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          supported_currencies?: string[];
          suspend_reason?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          table_count?: number | null;
          tax_rate?: number | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Update: {
          activation_events?: Json;
          address?: string | null;
          at_food_enabled?: boolean | null;
          banner_url?: string | null;
          bar_display_enabled?: boolean;
          billing_interval?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          currency?: string | null;
          custom_domain?: string | null;
          default_locale?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          enable_coupons?: boolean | null;
          enable_service_charge?: boolean | null;
          enable_tax?: boolean | null;
          enabled_payment_methods?: string[];
          establishment_type?: string | null;
          freeze_reason?: string | null;
          group_id?: string | null;
          id?: string;
          idle_timeout_minutes?: number | null;
          is_active?: boolean;
          last_active_at?: string | null;
          logo_url?: string | null;
          max_admins?: number;
          max_menu_items?: number;
          max_venues?: number;
          name?: string;
          notification_sound_id?: string | null;
          onboarding_completed?: boolean | null;
          onboarding_completed_at?: string | null;
          opening_hours?: Json;
          past_due_since?: string | null;
          phone?: string | null;
          primary_color?: string | null;
          screen_lock_mode?: string | null;
          secondary_color?: string | null;
          service_charge_rate?: number | null;
          slug?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_current_period_end?: string | null;
          subscription_current_period_start?: string | null;
          subscription_plan?: string;
          subscription_status?: string;
          supported_currencies?: string[];
          suspend_reason?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          table_count?: number | null;
          tax_rate?: number | null;
          trial_ends_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenants_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'restaurant_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string | null;
          default_view: string | null;
          id: string;
          kitchen_config: Json | null;
          language: string | null;
          notification_sound: string | null;
          pos_config: Json | null;
          theme: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          default_view?: string | null;
          id?: string;
          kitchen_config?: Json | null;
          language?: string | null;
          notification_sound?: string | null;
          pos_config?: Json | null;
          theme?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          default_view?: string | null;
          id?: string;
          kitchen_config?: Json | null;
          language?: string | null;
          notification_sound?: string | null;
          pos_config?: Json | null;
          theme?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_sessions: {
        Row: {
          created_at: string | null;
          device_info: Json | null;
          id: string;
          ip_address: string | null;
          login_at: string | null;
          login_type: string | null;
          logout_at: string | null;
          tenant_id: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          device_info?: Json | null;
          id?: string;
          ip_address?: string | null;
          login_at?: string | null;
          login_type?: string | null;
          logout_at?: string | null;
          tenant_id: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          device_info?: Json | null;
          id?: string;
          ip_address?: string | null;
          login_at?: string | null;
          login_type?: string | null;
          logout_at?: string | null;
          tenant_id?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_sessions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'admin_users';
            referencedColumns: ['id'];
          },
        ];
      };
      venues: {
        Row: {
          created_at: string;
          has_own_menu: boolean;
          id: string;
          is_active: boolean;
          name: string;
          name_en: string | null;
          slug: string;
          tenant_id: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          has_own_menu?: boolean;
          id?: string;
          is_active?: boolean;
          name: string;
          name_en?: string | null;
          slug: string;
          tenant_id: string;
          type?: string;
        };
        Update: {
          created_at?: string;
          has_own_menu?: boolean;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_en?: string | null;
          slug?: string;
          tenant_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venues_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      wave_events: {
        Row: {
          id: string;
          processed_at: string;
          type: string;
          wave_created_at: string | null;
        };
        Insert: {
          id: string;
          processed_at?: string;
          type: string;
          wave_created_at?: string | null;
        };
        Update: {
          id?: string;
          processed_at?: string;
          type?: string;
          wave_created_at?: string | null;
        };
        Relationships: [];
      };
      zones: {
        Row: {
          created_at: string | null;
          description: string | null;
          display_order: number | null;
          id: string;
          name: string;
          name_en: string | null;
          prefix: string;
          qr_design_id: string | null;
          tenant_id: string;
          venue_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name: string;
          name_en?: string | null;
          prefix: string;
          qr_design_id?: string | null;
          tenant_id: string;
          venue_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          display_order?: number | null;
          id?: string;
          name?: string;
          name_en?: string | null;
          prefix?: string;
          qr_design_id?: string | null;
          tenant_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zones_qr_design_id_fkey';
            columns: ['qr_design_id'];
            isOneToOne: false;
            referencedRelation: 'qr_designs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'zones_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'zones_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation_membership: {
        Args: {
          p_full_name: string;
          p_invitation_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      adjust_ingredient_stock_tx: {
        Args: {
          p_created_by?: string;
          p_delta: number;
          p_ingredient_id: string;
          p_movement_type: string;
          p_notes?: string;
          p_supplier_id?: string;
          p_tenant_id: string;
        };
        Returns: number;
      };
      assert_tenant_member: {
        Args: { p_tenant_id: string };
        Returns: undefined;
      };
      cancel_stock_count: {
        Args: { p_count_id: string; p_tenant_id: string };
        Returns: undefined;
      };
      claim_activation_event: {
        Args: { p_event_key: string; p_tenant_id: string };
        Returns: boolean;
      };
      claim_coupon_usage: { Args: { p_coupon_id: string }; Returns: boolean };
      commit_stock_count: {
        Args: {
          p_committed_by?: string;
          p_count_id: string;
          p_tenant_id: string;
        };
        Returns: number;
      };
      create_order_with_items: {
        Args: {
          p_client_request_id?: string;
          p_coupon_id?: string;
          p_customer_name?: string;
          p_customer_phone?: string;
          p_delivery_address?: string;
          p_discount_amount?: number;
          p_display_currency?: string;
          p_items?: Json;
          p_notes?: string;
          p_order_number: string;
          p_preparation_zone?: string;
          p_room_number?: string;
          p_server_id?: string;
          p_service_charge_amount?: number;
          p_service_type?: string;
          p_subtotal?: number;
          p_table_number?: string;
          p_tax_amount?: number;
          p_tenant_id: string;
          p_tip_amount?: number;
          p_total: number;
        };
        Returns: Json;
      };
      delete_admin_user_atomic: {
        Args: { p_admin_user_id: string; p_user_id: string };
        Returns: boolean;
      };
      destock_order: {
        Args: { p_created_by?: string; p_order_id: string; p_tenant_id: string };
        Returns: number;
      };
      expire_stale_payment_sessions: {
        Args: { p_max_age_minutes?: number };
        Returns: number;
      };
      generate_menu_slug: {
        Args: { p_name: string; p_tenant_id: string };
        Returns: string;
      };
      get_category_breakdown: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string };
        Returns: {
          category: string;
          revenue: number;
        }[];
      };
      get_co_ordered_items: {
        Args: { p_cart_ids: string[]; p_limit?: number; p_tenant_id: string };
        Returns: {
          menu_item_id: string;
        }[];
      };
      get_daily_comps: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string };
        Returns: {
          comp_count: number;
          comp_total: number;
          day: string;
        }[];
      };
      get_daily_revenue: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string };
        Returns: {
          day: string;
          order_count: number;
          revenue: number;
        }[];
      };
      get_house_account_balances: {
        Args: { p_tenant_id: string };
        Returns: {
          account_id: string;
          name: string;
          open_orders: number;
          outstanding: number;
          status: string;
        }[];
      };
      get_losses_by_reason: {
        Args: { p_end?: string; p_start?: string; p_tenant_id: string };
        Returns: {
          nb_movements: number;
          reason_code: string;
          total_cost_value: number;
          total_qty: number;
        }[];
      };
      get_my_tenant_ids: { Args: never; Returns: string[] };
      get_my_tenant_ids_array: { Args: never; Returns: string[] };
      get_order_summary: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string };
        Returns: {
          avg_basket: number;
          total_discounts: number;
          total_orders: number;
          total_revenue: number;
          total_service_charge: number;
          total_tax: number;
          total_tips: number;
        }[];
      };
      get_orders_for_tracking: {
        Args: { p_order_ids: string[]; p_tenant_id: string };
        Returns: Json;
      };
      get_owner_dashboard: {
        Args: { p_user_id: string };
        Returns: {
          orders_month: number;
          orders_today: number;
          revenue_month: number;
          revenue_today: number;
          tenant_id: string;
          tenant_is_active: boolean;
          tenant_logo_url: string;
          tenant_name: string;
          tenant_plan: string;
          tenant_slug: string;
          tenant_status: string;
        }[];
      };
      get_server_performance: {
        Args: { p_end_date: string; p_start_date: string; p_tenant_id: string };
        Returns: {
          orders: number;
          revenue: number;
          server_id: string;
          server_name: string;
        }[];
      };
      get_staff_stock_report: {
        Args: { p_end: string; p_start: string; p_tenant_id: string };
        Returns: {
          adjustment_out_qty: number;
          author_id: string;
          author_name: string;
          in_qty: number;
          manual_remove_qty: number;
          movements_count: number;
          order_destock_qty: number;
          out_qty: number;
        }[];
      };
      get_stock_movements_page: {
        Args: { p_limit?: number; p_offset?: number; p_tenant_id: string };
        Returns: {
          author_name: string;
          created_at: string;
          created_by: string;
          id: string;
          ingredient_id: string;
          ingredient_name: string;
          ingredient_unit: string;
          movement_type: string;
          notes: string;
          quantity: number;
          reason_code: string;
          reference_id: string;
          supplier_id: string;
          supplier_name: string;
          tenant_id: string;
          total_count: number;
        }[];
      };
      get_stock_status: {
        Args: { p_tenant_id: string };
        Returns: {
          category: string;
          cost_per_unit: number;
          current_stock: number;
          id: string;
          is_active: boolean;
          is_low: boolean;
          min_stock_alert: number;
          name: string;
          nb_items_using: number;
          unit: string;
        }[];
      };
      get_tenant_by_slug: {
        Args: { p_slug: string };
        Returns: {
          currency: string;
          enable_service_charge: boolean;
          enable_tax: boolean;
          establishment_type: string;
          id: string;
          is_active: boolean;
          logo_url: string;
          name: string;
          service_charge_rate: number;
          slug: string;
          tax_rate: number;
        }[];
      };
      get_tenant_public_by_id: {
        Args: { p_id: string };
        Returns: {
          currency: string;
          enable_service_charge: boolean;
          enable_tax: boolean;
          id: string;
          name: string;
          service_charge_rate: number;
          slug: string;
          tax_rate: number;
        }[];
      };
      get_top_items: {
        Args: {
          p_end_date: string;
          p_limit?: number;
          p_start_date: string;
          p_tenant_id: string;
        };
        Returns: {
          item_id: string;
          item_name: string;
          quantity_sold: number;
          revenue: number;
        }[];
      };
      import_recipes_tx: {
        Args: { p_rows: Json; p_tenant_id: string };
        Returns: Json;
      };
      increment_login_count: {
        Args: { admin_user_id: string };
        Returns: undefined;
      };
      increment_menu_item_favorites: {
        Args: { p_delta: number; p_item: string; p_tenant: string };
        Returns: number;
      };
      is_super_admin: { Args: never; Returns: boolean };
      is_table_occupied: {
        Args: { p_table_number: string; p_tenant_id: string };
        Returns: boolean;
      };
      next_order_number: { Args: { p_tenant_id: string }; Returns: string };
      open_stock_count: {
        Args: {
          p_created_by?: string;
          p_ingredient_ids?: string[];
          p_reference?: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      provision_group_restaurant: {
        Args: {
          p_email: string;
          p_group_id: string;
          p_name: string;
          p_plan: string;
          p_slug: string;
          p_type: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      provision_signup_tenant: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_name: string;
          p_phone?: string;
          p_plan: string;
          p_slug: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      reassign_order_table: {
        Args: {
          p_new_table_number: string;
          p_order_id: string;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      reconcile_stock_ledger: {
        Args: { p_created_by?: string; p_tenant_id: string };
        Returns: number;
      };
      record_loss_tx: {
        Args: {
          p_created_by?: string;
          p_ingredient_id: string;
          p_notes?: string;
          p_quantity: number;
          p_reason_code: string;
          p_tenant_id: string;
        };
        Returns: number;
      };
      record_refund: {
        Args: {
          p_amount: number;
          p_client_request_id?: string;
          p_created_by?: string;
          p_method: string;
          p_order_id: string;
          p_tenant_id: string;
        };
        Returns: string;
      };
      reset_tenant_data: {
        Args: { p_reset_type: string; p_tenant_id: string };
        Returns: Json;
      };
      restock_order: {
        Args: { p_created_by?: string; p_order_id: string; p_tenant_id: string };
        Returns: number;
      };
      save_stock_count_lines: {
        Args: { p_count_id: string; p_lines: Json; p_tenant_id: string };
        Returns: undefined;
      };
      set_opening_stock: {
        Args: {
          p_created_by?: string;
          p_ingredient_id: string;
          p_quantity: number;
          p_tenant_id: string;
        };
        Returns: undefined;
      };
      set_recipe_tx: {
        Args: { p_lines: Json; p_menu_item_id: string; p_tenant_id: string };
        Returns: undefined;
      };
      unclaim_coupon_usage: {
        Args: { p_coupon_id: string };
        Returns: undefined;
      };
      verify_stock_ledger: {
        Args: { p_tenant_id: string };
        Returns: {
          current_stock: number;
          drift: number;
          ingredient_id: string;
          ledger_sum: number;
          name: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
