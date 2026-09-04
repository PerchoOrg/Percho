export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_waitlist_signups: {
        Row: {
          brokerage: string
          created_at: string
          email: string
          id: string
          ip_address: string | null
          license_number: string | null
          mls_association: string
          name: string
          phone: string
          source: string
          user_agent: string | null
        }
        Insert: {
          brokerage: string
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          license_number?: string | null
          mls_association: string
          name: string
          phone: string
          source?: string
          user_agent?: string | null
        }
        Update: {
          brokerage?: string
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          license_number?: string | null
          mls_association?: string
          name?: string
          phone?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      agents: {
        Row: {
          bio: string | null
          brokerage: string | null
          created_at: string
          email: string
          headshot_url: string | null
          id: string
          is_admin: boolean
          license_no: string | null
          name: string
          phone: string | null
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          brokerage?: string | null
          created_at?: string
          email: string
          headshot_url?: string | null
          id?: string
          is_admin?: boolean
          license_no?: string | null
          name: string
          phone?: string | null
          slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          brokerage?: string | null
          created_at?: string
          email?: string
          headshot_url?: string | null
          id?: string
          is_admin?: boolean
          license_no?: string | null
          name?: string
          phone?: string | null
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_tour_videos: {
        Row: {
          aspect_ratio: string
          community_id: string
          cost_usd: number | null
          created_at: string
          duration_s: number
          error: string | null
          id: string
          input_photo_ids: string[]
          model: string
          poi_photo_id: string | null
          polling_url: string | null
          prompt: string
          provider_job_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string
          community_id: string
          cost_usd?: number | null
          created_at?: string
          duration_s?: number
          error?: string | null
          id?: string
          input_photo_ids?: string[]
          model: string
          poi_photo_id?: string | null
          polling_url?: string | null
          prompt: string
          provider_job_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string
          community_id?: string
          cost_usd?: number | null
          created_at?: string
          duration_s?: number
          error?: string | null
          id?: string
          input_photo_ids?: string[]
          model?: string
          poi_photo_id?: string | null
          polling_url?: string | null
          prompt?: string
          provider_job_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tour_videos_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tour_videos_poi_photo_id_fkey"
            columns: ["poi_photo_id"]
            isOneToOne: false
            referencedRelation: "poi_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          agent_id: string
          created_at: string
          id: number
          kind: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: number
          kind: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: number
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      buyers: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          attributes: string[] | null
          avg_age: string | null
          avg_income: string | null
          boundary: Json | null
          boundary_source: string | null
          builder: string | null
          city: string | null
          county: string | null
          cover_storage_path: string | null
          cover_video_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hero_image_url: string | null
          highlights: string[] | null
          hoa_fee_monthly: number | null
          homeowners_pct: string | null
          id: string
          interests: string[] | null
          kind: string
          lat: number | null
          lng: number | null
          median_home_value: string | null
          name: string
          narration_voice: string | null
          nearby: Json | null
          nextdoor_id: string | null
          nextdoor_slug: string | null
          nextdoor_url: string | null
          price_max: number | null
          price_min: number | null
          property_types: string[] | null
          residents_count: string | null
          seeded_at: string | null
          slug: string
          source: string
          state: string
          status: string
          updated_at: string
          website: string | null
          year_built: number | null
          year_built_end: number | null
          zip: string | null
        }
        Insert: {
          attributes?: string[] | null
          avg_age?: string | null
          avg_income?: string | null
          boundary?: Json | null
          boundary_source?: string | null
          builder?: string | null
          city?: string | null
          county?: string | null
          cover_storage_path?: string | null
          cover_video_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hero_image_url?: string | null
          highlights?: string[] | null
          hoa_fee_monthly?: number | null
          homeowners_pct?: string | null
          id?: string
          interests?: string[] | null
          kind?: string
          lat?: number | null
          lng?: number | null
          median_home_value?: string | null
          name: string
          narration_voice?: string | null
          nearby?: Json | null
          nextdoor_id?: string | null
          nextdoor_slug?: string | null
          nextdoor_url?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          residents_count?: string | null
          seeded_at?: string | null
          slug: string
          source?: string
          state?: string
          status?: string
          updated_at?: string
          website?: string | null
          year_built?: number | null
          year_built_end?: number | null
          zip?: string | null
        }
        Update: {
          attributes?: string[] | null
          avg_age?: string | null
          avg_income?: string | null
          boundary?: Json | null
          boundary_source?: string | null
          builder?: string | null
          city?: string | null
          county?: string | null
          cover_storage_path?: string | null
          cover_video_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          hero_image_url?: string | null
          highlights?: string[] | null
          hoa_fee_monthly?: number | null
          homeowners_pct?: string | null
          id?: string
          interests?: string[] | null
          kind?: string
          lat?: number | null
          lng?: number | null
          median_home_value?: string | null
          name?: string
          narration_voice?: string | null
          nearby?: Json | null
          nextdoor_id?: string | null
          nextdoor_slug?: string | null
          nextdoor_url?: string | null
          price_max?: number | null
          price_min?: number | null
          property_types?: string[] | null
          residents_count?: string | null
          seeded_at?: string | null
          slug?: string
          source?: string
          state?: string
          status?: string
          updated_at?: string
          website?: string | null
          year_built?: number | null
          year_built_end?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communities_cover_video_id_fkey"
            columns: ["cover_video_id"]
            isOneToOne: false
            referencedRelation: "community_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          community_id: string
          created_at: string
          device_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          community_id: string
          created_at?: string
          device_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_photo_sources: {
        Row: {
          community_id: string
          created_at: string
          enabled: boolean
          expanded_at: string | null
          id: string
          label: string | null
          last_ingested_at: string | null
          last_result: Json | null
          origin: string
          url: string
        }
        Insert: {
          community_id: string
          created_at?: string
          enabled?: boolean
          expanded_at?: string | null
          id?: string
          label?: string | null
          last_ingested_at?: string | null
          last_result?: Json | null
          origin: string
          url: string
        }
        Update: {
          community_id?: string
          created_at?: string
          enabled?: boolean
          expanded_at?: string | null
          id?: string
          label?: string | null
          last_ingested_at?: string | null
          last_result?: Json | null
          origin?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_photo_sources_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_photos: {
        Row: {
          alt_text: string | null
          category: string | null
          community_id: string
          created_at: string
          height: number | null
          id: string
          kind: string
          lat: number | null
          lng: number | null
          school_id: string | null
          sort_order: number
          status: string
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          category?: string | null
          community_id: string
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          school_id?: string | null
          sort_order?: number
          status?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          category?: string | null
          community_id?: string
          created_at?: string
          height?: number | null
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          school_id?: string | null
          sort_order?: number
          status?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_photos_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_photos_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poi_photos: {
        Row: {
          community_id: string
          poi_photo_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          community_id: string
          poi_photo_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          community_id?: string
          poi_photo_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poi_photos_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poi_photos_poi_photo_id_fkey"
            columns: ["poi_photo_id"]
            isOneToOne: false
            referencedRelation: "poi_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      community_pois: {
        Row: {
          ai_score: number | null
          community_id: string
          discovered_at: string
          distance_m: number | null
          intent_bucket: string
          poi_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          ai_score?: number | null
          community_id: string
          discovered_at?: string
          distance_m?: number | null
          intent_bucket: string
          poi_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          ai_score?: number | null
          community_id?: string
          discovered_at?: string
          distance_m?: number | null
          intent_bucket?: string
          poi_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_pois_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_pois_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "pois"
            referencedColumns: ["id"]
          },
        ]
      }
      community_tour_runs: {
        Row: {
          community_id: string
          created_at: string
          id: string
          status: string
          step_results: Json
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          status?: string
          step_results?: Json
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          status?: string
          step_results?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_tour_runs_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_video_extra_links: {
        Row: {
          community_id: string
          created_at: string
          video_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          video_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_video_extra_links_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_video_extra_links_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "community_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      community_videos: {
        Row: {
          address: string | null
          approved_at: string | null
          approved_by: string | null
          bucket: string | null
          category: string | null
          category_needs_review: boolean
          cf_video_id: string
          community_id: string
          created_at: string
          description: string | null
          duration_sec: number | null
          id: string
          intent_bucket: string | null
          is_primary: boolean
          kind: string | null
          lat: number | null
          lng: number | null
          school_id: string | null
          status: string
          title: string | null
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bucket?: string | null
          category?: string | null
          category_needs_review?: boolean
          cf_video_id: string
          community_id: string
          created_at?: string
          description?: string | null
          duration_sec?: number | null
          id?: string
          intent_bucket?: string | null
          is_primary?: boolean
          kind?: string | null
          lat?: number | null
          lng?: number | null
          school_id?: string | null
          status?: string
          title?: string | null
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          address?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bucket?: string | null
          category?: string | null
          category_needs_review?: boolean
          cf_video_id?: string
          community_id?: string
          created_at?: string
          description?: string | null
          duration_sec?: number | null
          id?: string
          intent_bucket?: string | null
          is_primary?: boolean
          kind?: string | null
          lat?: number | null
          lng?: number | null
          school_id?: string | null
          status?: string
          title?: string | null
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_videos_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_videos_school_fk"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_videos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          card_id: string | null
          card_type: string | null
          community_id: string | null
          created_at: string
          event_type: string
          geo_country: string | null
          geo_state: string | null
          id: number
          listing_id: string | null
          meta: Json | null
          session_id: string | null
          source: string | null
        }
        Insert: {
          card_id?: string | null
          card_type?: string | null
          community_id?: string | null
          created_at?: string
          event_type: string
          geo_country?: string | null
          geo_state?: string | null
          id?: number
          listing_id?: string | null
          meta?: Json | null
          session_id?: string | null
          source?: string | null
        }
        Update: {
          card_id?: string | null
          card_type?: string | null
          community_id?: string | null
          created_at?: string
          event_type?: string
          geo_country?: string | null
          geo_state?: string | null
          id?: number
          listing_id?: string | null
          meta?: Json | null
          session_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_videos: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          aspect_ratio: string | null
          cf_stream_uid: string | null
          community_id: string | null
          created_at: string
          duration_s: number | null
          error: string | null
          generator: string | null
          id: string
          input_photo_ids: string[] | null
          intent_bucket: string | null
          listing_id: string | null
          narrative: Json | null
          reviewed_at: string | null
          scope: string
          scope_id: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          aspect_ratio?: string | null
          cf_stream_uid?: string | null
          community_id?: string | null
          created_at?: string
          duration_s?: number | null
          error?: string | null
          generator?: string | null
          id?: string
          input_photo_ids?: string[] | null
          intent_bucket?: string | null
          listing_id?: string | null
          narrative?: Json | null
          reviewed_at?: string | null
          scope: string
          scope_id?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          aspect_ratio?: string | null
          cf_stream_uid?: string | null
          community_id?: string | null
          created_at?: string
          duration_s?: number | null
          error?: string | null
          generator?: string | null
          id?: string
          input_photo_ids?: string[] | null
          intent_bucket?: string | null
          listing_id?: string | null
          narrative?: Json | null
          reviewed_at?: string | null
          scope?: string
          scope_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_videos_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_videos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      k12_attendance_zones: {
        Row: {
          county: string | null
          created_at: string | null
          effective_year: number | null
          geometry: unknown
          id: string
          level: string
          school_id: string
          source: string | null
        }
        Insert: {
          county?: string | null
          created_at?: string | null
          effective_year?: number | null
          geometry: unknown
          id?: string
          level: string
          school_id: string
          source?: string | null
        }
        Update: {
          county?: string | null
          created_at?: string | null
          effective_year?: number | null
          geometry?: unknown
          id?: string
          level?: string
          school_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "k12_attendance_zones_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "k12_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      k12_school_photos: {
        Row: {
          ai_score: number | null
          ai_tags: Json | null
          applicable_buckets: string[]
          attribution: string | null
          content_hash: string | null
          created_at: string | null
          height: number | null
          id: string
          is_primary: boolean
          order_idx: number | null
          school_id: string
          scraped_at: string | null
          source: string
          source_url: string | null
          status: string
          storage_path: string
          width: number | null
        }
        Insert: {
          ai_score?: number | null
          ai_tags?: Json | null
          applicable_buckets?: string[]
          attribution?: string | null
          content_hash?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          order_idx?: number | null
          school_id: string
          scraped_at?: string | null
          source: string
          source_url?: string | null
          status?: string
          storage_path: string
          width?: number | null
        }
        Update: {
          ai_score?: number | null
          ai_tags?: Json | null
          applicable_buckets?: string[]
          attribution?: string | null
          content_hash?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          order_idx?: number | null
          school_id?: string
          scraped_at?: string | null
          source?: string
          source_url?: string | null
          status?: string
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "k12_school_photos_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "k12_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      k12_school_reviews: {
        Row: {
          gs_review_id: string | null
          id: string
          review_date: string | null
          review_text: string | null
          reviewer_type: string | null
          school_id: string
          school_response: string | null
          scraped_at: string | null
          source: string
          star_rating: number | null
          topical_ratings: Json | null
          would_recommend: boolean | null
        }
        Insert: {
          gs_review_id?: string | null
          id?: string
          review_date?: string | null
          review_text?: string | null
          reviewer_type?: string | null
          school_id: string
          school_response?: string | null
          scraped_at?: string | null
          source?: string
          star_rating?: number | null
          topical_ratings?: Json | null
          would_recommend?: boolean | null
        }
        Update: {
          gs_review_id?: string | null
          id?: string
          review_date?: string | null
          review_text?: string | null
          reviewer_type?: string | null
          school_id?: string
          school_response?: string | null
          scraped_at?: string | null
          source?: string
          star_rating?: number | null
          topical_ratings?: Json | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "k12_school_reviews_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "k12_schools"
            referencedColumns: ["id"]
          },
        ]
      }
      k12_schools: {
        Row: {
          address: string | null
          awards: Json | null
          city: string | null
          colors: string[] | null
          county: string | null
          created_at: string | null
          district: string | null
          enrollment: number | null
          geom: unknown
          grade_range: string | null
          gs_rating: number | null
          gs_school_id: string | null
          id: string
          lat: number | null
          level: string | null
          lng: number | null
          mascot: string | null
          name: string
          nces_id: string | null
          niche_id: string | null
          parent_rating: number | null
          phone: string | null
          raw: Json | null
          review_count: number | null
          school_type: string | null
          scraped_at: string | null
          source: string
          source_url: string | null
          state: string | null
          student_teacher_ratio: number | null
          test_scores: Json | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          awards?: Json | null
          city?: string | null
          colors?: string[] | null
          county?: string | null
          created_at?: string | null
          district?: string | null
          enrollment?: number | null
          geom?: unknown
          grade_range?: string | null
          gs_rating?: number | null
          gs_school_id?: string | null
          id?: string
          lat?: number | null
          level?: string | null
          lng?: number | null
          mascot?: string | null
          name: string
          nces_id?: string | null
          niche_id?: string | null
          parent_rating?: number | null
          phone?: string | null
          raw?: Json | null
          review_count?: number | null
          school_type?: string | null
          scraped_at?: string | null
          source: string
          source_url?: string | null
          state?: string | null
          student_teacher_ratio?: number | null
          test_scores?: Json | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          awards?: Json | null
          city?: string | null
          colors?: string[] | null
          county?: string | null
          created_at?: string | null
          district?: string | null
          enrollment?: number | null
          geom?: unknown
          grade_range?: string | null
          gs_rating?: number | null
          gs_school_id?: string | null
          id?: string
          lat?: number | null
          level?: string | null
          lng?: number | null
          mascot?: string | null
          name?: string
          nces_id?: string | null
          niche_id?: string | null
          parent_rating?: number | null
          phone?: string | null
          raw?: Json | null
          review_count?: number | null
          school_type?: string | null
          scraped_at?: string | null
          source?: string
          source_url?: string | null
          state?: string | null
          student_teacher_ratio?: number | null
          test_scores?: Json | null
          updated_at?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          agent_id: string
          community_id: string | null
          created_at: string
          email: string | null
          followed_up_at: string | null
          id: string
          listing_id: string | null
          message: string | null
          name: string
          notified_at: string | null
          phone: string | null
          source: string | null
        }
        Insert: {
          agent_id: string
          community_id?: string | null
          created_at?: string
          email?: string | null
          followed_up_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          name: string
          notified_at?: string | null
          phone?: string | null
          source?: string | null
        }
        Update: {
          agent_id?: string
          community_id?: string | null
          created_at?: string
          email?: string | null
          followed_up_at?: string | null
          id?: string
          listing_id?: string | null
          message?: string | null
          name?: string
          notified_at?: string | null
          phone?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_insights: {
        Row: {
          basis: Json
          decisiveness: number
          detail: string
          generated_at: string
          headline: string
          id: string
          kind: string
          listing_id: string
          model: string | null
          reviewed_at: string | null
          status: string
          theme: string
          verify: string | null
        }
        Insert: {
          basis?: Json
          decisiveness?: number
          detail: string
          generated_at?: string
          headline: string
          id?: string
          kind: string
          listing_id: string
          model?: string | null
          reviewed_at?: string | null
          status?: string
          theme: string
          verify?: string | null
        }
        Update: {
          basis?: Json
          decisiveness?: number
          detail?: string
          generated_at?: string
          headline?: string
          id?: string
          kind?: string
          listing_id?: string
          model?: string | null
          reviewed_at?: string | null
          status?: string
          theme?: string
          verify?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_insights_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_likes: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          listing_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          listing_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          listing_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_likes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photo_clips: {
        Row: {
          ai_generated: boolean
          cost_usd: number | null
          created_at: string
          duration_s: number | null
          engine: string
          error: string | null
          id: string
          listing_photo_id: string
          move: string | null
          pair_photo_id: string | null
          pair_role: string | null
          polling_url: string | null
          prompt: string | null
          provider_job_id: string | null
          render_key: string | null
          status: string
          storage_path: string | null
          surface: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_s?: number | null
          engine: string
          error?: string | null
          id?: string
          listing_photo_id: string
          move?: string | null
          pair_photo_id?: string | null
          pair_role?: string | null
          polling_url?: string | null
          prompt?: string | null
          provider_job_id?: string | null
          render_key?: string | null
          status?: string
          storage_path?: string | null
          surface: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_s?: number | null
          engine?: string
          error?: string | null
          id?: string
          listing_photo_id?: string
          move?: string | null
          pair_photo_id?: string | null
          pair_role?: string | null
          polling_url?: string | null
          prompt?: string | null
          provider_job_id?: string | null
          render_key?: string | null
          status?: string
          storage_path?: string | null
          surface?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photo_clips_listing_photo_id_fkey"
            columns: ["listing_photo_id"]
            isOneToOne: false
            referencedRelation: "listing_photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_photo_clips_pair_photo_id_fkey"
            columns: ["pair_photo_id"]
            isOneToOne: false
            referencedRelation: "listing_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_photos: {
        Row: {
          ai_model: string | null
          ai_score: number | null
          ai_tags: Json | null
          alt_text: string | null
          created_at: string
          enhanced_at: string | null
          enhanced_error: string | null
          enhanced_meta: Json | null
          enhanced_path: string | null
          enhanced_preset: string | null
          enhanced_status: string
          height: number | null
          hero_pick: boolean
          id: string
          listing_id: string
          rejection_reason: string | null
          review_status: string
          sort_order: number
          status: string
          storage_path: string
          tagged_at: string | null
          used_clip_index: number | null
          used_in_video_at: string | null
          width: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_score?: number | null
          ai_tags?: Json | null
          alt_text?: string | null
          created_at?: string
          enhanced_at?: string | null
          enhanced_error?: string | null
          enhanced_meta?: Json | null
          enhanced_path?: string | null
          enhanced_preset?: string | null
          enhanced_status?: string
          height?: number | null
          hero_pick?: boolean
          id?: string
          listing_id: string
          rejection_reason?: string | null
          review_status?: string
          sort_order?: number
          status?: string
          storage_path: string
          tagged_at?: string | null
          used_clip_index?: number | null
          used_in_video_at?: string | null
          width?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_score?: number | null
          ai_tags?: Json | null
          alt_text?: string | null
          created_at?: string
          enhanced_at?: string | null
          enhanced_error?: string | null
          enhanced_meta?: Json | null
          enhanced_path?: string | null
          enhanced_preset?: string | null
          enhanced_status?: string
          height?: number | null
          hero_pick?: boolean
          id?: string
          listing_id?: string
          rejection_reason?: string | null
          review_status?: string
          sort_order?: number
          status?: string
          storage_path?: string
          tagged_at?: string | null
          used_clip_index?: number | null
          used_in_video_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_poi_photos: {
        Row: {
          listing_id: string
          poi_photo_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          listing_id: string
          poi_photo_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          listing_id?: string
          poi_photo_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_poi_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_poi_photos_poi_photo_id_fkey"
            columns: ["poi_photo_id"]
            isOneToOne: false
            referencedRelation: "poi_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_pois: {
        Row: {
          ai_score: number | null
          discovered_at: string
          distance_m: number | null
          intent_bucket: string
          listing_id: string
          poi_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          ai_score?: number | null
          discovered_at?: string
          distance_m?: number | null
          intent_bucket: string
          listing_id: string
          poi_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          ai_score?: number | null
          discovered_at?: string
          distance_m?: number | null
          intent_bucket?: string
          listing_id?: string
          poi_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_pois_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_pois_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "pois"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_tour_assemblies: {
        Row: {
          bgm: Json | null
          cf_stream_uid: string | null
          created_at: string
          error: string | null
          id: string
          listing_id: string
          ordered_clips: Json
          photos_dropped: Json
          run_id: string
          status: string
          surface: string
          updated_at: string
          video_row_id: string | null
          video_url: string | null
        }
        Insert: {
          bgm?: Json | null
          cf_stream_uid?: string | null
          created_at?: string
          error?: string | null
          id?: string
          listing_id: string
          ordered_clips?: Json
          photos_dropped?: Json
          run_id: string
          status?: string
          surface: string
          updated_at?: string
          video_row_id?: string | null
          video_url?: string | null
        }
        Update: {
          bgm?: Json | null
          cf_stream_uid?: string | null
          created_at?: string
          error?: string | null
          id?: string
          listing_id?: string
          ordered_clips?: Json
          photos_dropped?: Json
          run_id?: string
          status?: string
          surface?: string
          updated_at?: string
          video_row_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_tour_assemblies_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_tour_assemblies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_tour_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_tour_assemblies_video_row_id_fkey"
            columns: ["video_row_id"]
            isOneToOne: false
            referencedRelation: "listing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_tour_runs: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          status: string
          step_results: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          status?: string
          step_results?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          status?: string
          step_results?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_tour_runs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_videos: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cf_video_id: string | null
          cf_video_id_landscape: string | null
          cf_video_id_square: string | null
          created_at: string
          duration_sec: number | null
          external_url: string | null
          id: string
          kind: string
          listing_id: string
          sort_order: number
          status: string
          title: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cf_video_id?: string | null
          cf_video_id_landscape?: string | null
          cf_video_id_square?: string | null
          created_at?: string
          duration_sec?: number | null
          external_url?: string | null
          id?: string
          kind: string
          listing_id: string
          sort_order?: number
          status?: string
          title?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cf_video_id?: string | null
          cf_video_id_landscape?: string | null
          cf_video_id_square?: string | null
          created_at?: string
          duration_sec?: number | null
          external_url?: string | null
          id?: string
          kind?: string
          listing_id?: string
          sort_order?: number
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_videos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string
          agent_id: string | null
          ai_style: Json | null
          baths: number | null
          beds: number | null
          city: string
          community_id: string | null
          cover_url: string | null
          created_at: string
          description: string[]
          external_agent_name: string | null
          external_agent_phone: string | null
          external_office: string | null
          hoa: string | null
          id: string
          lat: number | null
          lng: number | null
          lot_size: string | null
          map_cached_at: string | null
          map_url: string | null
          neighborhood: string | null
          price: number | null
          published_at: string | null
          shares: number
          slug: string
          source: string | null
          source_id: string | null
          sqft: number | null
          state: string
          status: string
          style: string | null
          updated_at: string
          views: number
          year_built: number | null
          zip: string | null
        }
        Insert: {
          address: string
          agent_id?: string | null
          ai_style?: Json | null
          baths?: number | null
          beds?: number | null
          city: string
          community_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string[]
          external_agent_name?: string | null
          external_agent_phone?: string | null
          external_office?: string | null
          hoa?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size?: string | null
          map_cached_at?: string | null
          map_url?: string | null
          neighborhood?: string | null
          price?: number | null
          published_at?: string | null
          shares?: number
          slug: string
          source?: string | null
          source_id?: string | null
          sqft?: number | null
          state?: string
          status?: string
          style?: string | null
          updated_at?: string
          views?: number
          year_built?: number | null
          zip?: string | null
        }
        Update: {
          address?: string
          agent_id?: string | null
          ai_style?: Json | null
          baths?: number | null
          beds?: number | null
          city?: string
          community_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string[]
          external_agent_name?: string | null
          external_agent_phone?: string | null
          external_office?: string | null
          hoa?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size?: string | null
          map_cached_at?: string | null
          map_url?: string | null
          neighborhood?: string | null
          price?: number | null
          published_at?: string | null
          shares?: number
          slug?: string
          source?: string | null
          source_id?: string | null
          sqft?: number | null
          state?: string
          status?: string
          style?: string | null
          updated_at?: string
          views?: number
          year_built?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_listings: {
        Row: {
          bathrooms_total_integer: number | null
          bedrooms_total: number | null
          city: string | null
          days_on_market: number | null
          id: string
          internet_entire_listing_display_yn: boolean | null
          latitude: number | null
          list_agent_full_name: string | null
          list_agent_mls_id: string | null
          list_office_name: string | null
          list_price: number | null
          listing_key: string
          living_area: number | null
          longitude: number | null
          lot_size_acres: number | null
          mirrored_at: string
          modification_timestamp: string | null
          our_listing_id: string | null
          postal_code: string | null
          property_sub_type: string | null
          property_type: string | null
          public_remarks: string | null
          source_system: string
          standard_status: string | null
          state_or_province: string | null
          street_name: string | null
          street_number: string | null
          street_suffix: string | null
          year_built: number | null
        }
        Insert: {
          bathrooms_total_integer?: number | null
          bedrooms_total?: number | null
          city?: string | null
          days_on_market?: number | null
          id?: string
          internet_entire_listing_display_yn?: boolean | null
          latitude?: number | null
          list_agent_full_name?: string | null
          list_agent_mls_id?: string | null
          list_office_name?: string | null
          list_price?: number | null
          listing_key: string
          living_area?: number | null
          longitude?: number | null
          lot_size_acres?: number | null
          mirrored_at?: string
          modification_timestamp?: string | null
          our_listing_id?: string | null
          postal_code?: string | null
          property_sub_type?: string | null
          property_type?: string | null
          public_remarks?: string | null
          source_system: string
          standard_status?: string | null
          state_or_province?: string | null
          street_name?: string | null
          street_number?: string | null
          street_suffix?: string | null
          year_built?: number | null
        }
        Update: {
          bathrooms_total_integer?: number | null
          bedrooms_total?: number | null
          city?: string | null
          days_on_market?: number | null
          id?: string
          internet_entire_listing_display_yn?: boolean | null
          latitude?: number | null
          list_agent_full_name?: string | null
          list_agent_mls_id?: string | null
          list_office_name?: string | null
          list_price?: number | null
          listing_key?: string
          living_area?: number | null
          longitude?: number | null
          lot_size_acres?: number | null
          mirrored_at?: string
          modification_timestamp?: string | null
          our_listing_id?: string | null
          postal_code?: string | null
          property_sub_type?: string | null
          property_type?: string | null
          public_remarks?: string | null
          source_system?: string
          standard_status?: string | null
          state_or_province?: string | null
          street_name?: string | null
          street_number?: string | null
          street_suffix?: string | null
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mls_listings_our_listing_id_fkey"
            columns: ["our_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      mls_media: {
        Row: {
          display_order: number | null
          id: string
          listing_key: string
          media_category: string | null
          media_key: string
          media_url: string
          mirrored_at: string
          modification_timestamp: string | null
          short_description: string | null
          source_system: string
        }
        Insert: {
          display_order?: number | null
          id?: string
          listing_key: string
          media_category?: string | null
          media_key: string
          media_url: string
          mirrored_at?: string
          modification_timestamp?: string | null
          short_description?: string | null
          source_system: string
        }
        Update: {
          display_order?: number | null
          id?: string
          listing_key?: string
          media_category?: string | null
          media_key?: string
          media_url?: string
          mirrored_at?: string
          modification_timestamp?: string | null
          short_description?: string | null
          source_system?: string
        }
        Relationships: []
      }
      mls_members: {
        Row: {
          id: string
          member_email: string | null
          member_full_name: string | null
          member_key: string
          member_mls_id: string | null
          member_office_key: string | null
          mirrored_at: string
          modification_timestamp: string | null
          source_system: string
        }
        Insert: {
          id?: string
          member_email?: string | null
          member_full_name?: string | null
          member_key: string
          member_mls_id?: string | null
          member_office_key?: string | null
          mirrored_at?: string
          modification_timestamp?: string | null
          source_system: string
        }
        Update: {
          id?: string
          member_email?: string | null
          member_full_name?: string | null
          member_key?: string
          member_mls_id?: string | null
          member_office_key?: string | null
          mirrored_at?: string
          modification_timestamp?: string | null
          source_system?: string
        }
        Relationships: []
      }
      mls_offices: {
        Row: {
          id: string
          mirrored_at: string
          modification_timestamp: string | null
          office_key: string
          office_mls_id: string | null
          office_name: string | null
          office_phone: string | null
          source_system: string
        }
        Insert: {
          id?: string
          mirrored_at?: string
          modification_timestamp?: string | null
          office_key: string
          office_mls_id?: string | null
          office_name?: string | null
          office_phone?: string | null
          source_system: string
        }
        Update: {
          id?: string
          mirrored_at?: string
          modification_timestamp?: string | null
          office_key?: string
          office_mls_id?: string | null
          office_name?: string | null
          office_phone?: string | null
          source_system?: string
        }
        Relationships: []
      }
      mls_sync_state: {
        Row: {
          last_modification_timestamp: string | null
          source_system: string
          updated_at: string
        }
        Insert: {
          last_modification_timestamp?: string | null
          source_system: string
          updated_at?: string
        }
        Update: {
          last_modification_timestamp?: string | null
          source_system?: string
          updated_at?: string
        }
        Relationships: []
      }
      mobile_events: {
        Row: {
          at: string
          id: number
          install_id: string
          listing_id: string | null
          payload: Json
          received_at: string
          seq: number
          type: string
          user_id: string | null
        }
        Insert: {
          at: string
          id?: never
          install_id: string
          listing_id?: string | null
          payload: Json
          received_at?: string
          seq: number
          type: string
          user_id?: string | null
        }
        Update: {
          at?: string
          id?: never
          install_id?: string
          listing_id?: string | null
          payload?: Json
          received_at?: string
          seq?: number
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      photo_clips: {
        Row: {
          ai_generated: boolean
          cost_usd: number | null
          created_at: string
          duration_s: number | null
          engine: string
          error: string | null
          id: string
          move: string | null
          photo_id: string
          polling_url: string | null
          prompt: string | null
          provider_job_id: string | null
          render_key: string | null
          status: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_s?: number | null
          engine: string
          error?: string | null
          id?: string
          move?: string | null
          photo_id: string
          polling_url?: string | null
          prompt?: string | null
          provider_job_id?: string | null
          render_key?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          cost_usd?: number | null
          created_at?: string
          duration_s?: number | null
          engine?: string
          error?: string | null
          id?: string
          move?: string | null
          photo_id?: string
          polling_url?: string | null
          prompt?: string | null
          provider_job_id?: string | null
          render_key?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_clips_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "poi_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          category: string | null
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          storage_url: string
        }
        Insert: {
          caption?: string | null
          category?: string | null
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          storage_url: string
        }
        Update: {
          caption?: string | null
          category?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          storage_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_photos: {
        Row: {
          ai_model: string | null
          ai_score: number | null
          ai_tags: Json | null
          applicable_buckets: string[]
          attribution: Json | null
          bytes: number | null
          content_hash: string | null
          created_at: string
          curated_at: string | null
          curator_tags: Json | null
          curator_version: number | null
          enhanced_at: string | null
          enhanced_error: string | null
          enhanced_meta: Json | null
          enhanced_path: string | null
          enhanced_preset: string | null
          enhanced_status: string
          google_photo_name: string | null
          height_px: number | null
          id: string
          outpaint_error: string | null
          outpaint_meta: Json | null
          outpaint_status: string
          outpainted_at: string | null
          outpainted_path: string | null
          poi_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          storage_path: string
          tagged_at: string | null
          width_px: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_score?: number | null
          ai_tags?: Json | null
          applicable_buckets?: string[]
          attribution?: Json | null
          bytes?: number | null
          content_hash?: string | null
          created_at?: string
          curated_at?: string | null
          curator_tags?: Json | null
          curator_version?: number | null
          enhanced_at?: string | null
          enhanced_error?: string | null
          enhanced_meta?: Json | null
          enhanced_path?: string | null
          enhanced_preset?: string | null
          enhanced_status?: string
          google_photo_name?: string | null
          height_px?: number | null
          id?: string
          outpaint_error?: string | null
          outpaint_meta?: Json | null
          outpaint_status?: string
          outpainted_at?: string | null
          outpainted_path?: string | null
          poi_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
          storage_path: string
          tagged_at?: string | null
          width_px?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_score?: number | null
          ai_tags?: Json | null
          applicable_buckets?: string[]
          attribution?: Json | null
          bytes?: number | null
          content_hash?: string | null
          created_at?: string
          curated_at?: string | null
          curator_tags?: Json | null
          curator_version?: number | null
          enhanced_at?: string | null
          enhanced_error?: string | null
          enhanced_meta?: Json | null
          enhanced_path?: string | null
          enhanced_preset?: string | null
          enhanced_status?: string
          google_photo_name?: string | null
          height_px?: number | null
          id?: string
          outpaint_error?: string | null
          outpaint_meta?: Json | null
          outpaint_status?: string
          outpainted_at?: string | null
          outpainted_path?: string | null
          poi_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          storage_path?: string
          tagged_at?: string | null
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "poi_photos_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "pois"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_photos_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_traffic: {
        Row: {
          congestion_ratio: number | null
          destination_label: string | null
          duration_actual_s: number | null
          duration_free_s: number | null
          fetched_at: string
          id: string
          listing_id: string
          poi_id: string | null
          time_bucket: string
        }
        Insert: {
          congestion_ratio?: number | null
          destination_label?: string | null
          duration_actual_s?: number | null
          duration_free_s?: number | null
          fetched_at?: string
          id?: string
          listing_id: string
          poi_id?: string | null
          time_bucket: string
        }
        Update: {
          congestion_ratio?: number | null
          destination_label?: string | null
          duration_actual_s?: number | null
          duration_free_s?: number | null
          fetched_at?: string
          id?: string
          listing_id?: string
          poi_id?: string | null
          time_bucket?: string
        }
        Relationships: [
          {
            foreignKeyName: "poi_traffic_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poi_traffic_poi_id_fkey"
            columns: ["poi_id"]
            isOneToOne: false
            referencedRelation: "pois"
            referencedColumns: ["id"]
          },
        ]
      }
      pois: {
        Row: {
          ai_model: string | null
          ai_summary: string | null
          ai_tags: Json | null
          business_status: string | null
          discovered_at: string
          display_name: string
          formatted_address: string | null
          google_place_id: string
          id: string
          location: unknown
          primary_type: string | null
          rating: number | null
          raw_place: Json | null
          refreshed_at: string
          tagged_at: string | null
          types: string[] | null
          user_ratings_total: number | null
        }
        Insert: {
          ai_model?: string | null
          ai_summary?: string | null
          ai_tags?: Json | null
          business_status?: string | null
          discovered_at?: string
          display_name: string
          formatted_address?: string | null
          google_place_id: string
          id?: string
          location?: unknown
          primary_type?: string | null
          rating?: number | null
          raw_place?: Json | null
          refreshed_at?: string
          tagged_at?: string | null
          types?: string[] | null
          user_ratings_total?: number | null
        }
        Update: {
          ai_model?: string | null
          ai_summary?: string | null
          ai_tags?: Json | null
          business_status?: string | null
          discovered_at?: string
          display_name?: string
          formatted_address?: string | null
          google_place_id?: string
          id?: string
          location?: unknown
          primary_type?: string | null
          rating?: number | null
          raw_place?: Json | null
          refreshed_at?: string
          tagged_at?: string | null
          types?: string[] | null
          user_ratings_total?: number | null
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          attempts: number
          created_at: string
          engine: string | null
          error: string | null
          id: string
          listing_id: string
          orientations: string[] | null
          run_id: string | null
          status: string
          step: string
          updated_at: string
          video_row_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          listing_id: string
          orientations?: string[] | null
          run_id?: string | null
          status?: string
          step?: string
          updated_at?: string
          video_row_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          listing_id?: string
          orientations?: string[] | null
          run_id?: string | null
          status?: string
          step?: string
          updated_at?: string
          video_row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "listing_tour_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_video_row_id_fkey"
            columns: ["video_row_id"]
            isOneToOne: false
            referencedRelation: "listing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      research_responses: {
        Row: {
          answers: Json
          contact: string | null
          created_at: string
          duration_ms: number | null
          id: string
          lang: string
          study: string
          user_agent: string | null
        }
        Insert: {
          answers: Json
          contact?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          lang?: string
          study: string
          user_agent?: string | null
        }
        Update: {
          answers?: Json
          contact?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          lang?: string
          study?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      review_events: {
        Row: {
          action: string
          ai_prediction: Json | null
          created_at: string
          entity_ref: Json
          entity_type: string
          human_note: string | null
          human_value: Json | null
          id: number
          listing_id: string
          reason_tags: string[] | null
          reviewer_id: string | null
        }
        Insert: {
          action: string
          ai_prediction?: Json | null
          created_at?: string
          entity_ref: Json
          entity_type: string
          human_note?: string | null
          human_value?: Json | null
          id?: number
          listing_id: string
          reason_tags?: string[] | null
          reviewer_id?: string | null
        }
        Update: {
          action?: string
          ai_prediction?: Json | null
          created_at?: string
          entity_ref?: Json
          entity_type?: string
          human_note?: string | null
          human_value?: Json | null
          id?: number
          listing_id?: string
          reason_tags?: string[] | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_communities: {
        Row: {
          community_id: string
          created_at: string
          device_id: string
          user_id: string | null
        }
        Insert: {
          community_id: string
          created_at?: string
          device_id: string
          user_id?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string
          device_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listings: {
        Row: {
          created_at: string
          device_id: string
          listing_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          listing_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          listing_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          community_id: string
          grades: string | null
          id: string
          name: string
          rating: number | null
          recorded_at: string
          recorded_by: string
          source_url: string
        }
        Insert: {
          community_id: string
          grades?: string | null
          id?: string
          name: string
          rating?: number | null
          recorded_at?: string
          recorded_by: string
          source_url: string
        }
        Update: {
          community_id?: string
          grades?: string | null
          id?: string
          name?: string
          rating?: number | null
          recorded_at?: string
          recorded_by?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schools_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tour_assemblies: {
        Row: {
          bgm: Json | null
          cf_stream_uid: string | null
          community_id: string
          created_at: string
          error: string | null
          id: string
          narration: Json | null
          ordered_clips: Json
          photos_dropped: Json
          run_id: string
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          bgm?: Json | null
          cf_stream_uid?: string | null
          community_id: string
          created_at?: string
          error?: string | null
          id?: string
          narration?: Json | null
          ordered_clips?: Json
          photos_dropped?: Json
          run_id: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          bgm?: Json | null
          cf_stream_uid?: string | null
          community_id?: string
          created_at?: string
          error?: string | null
          id?: string
          narration?: Json | null
          ordered_clips?: Json
          photos_dropped?: Json
          run_id?: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_assemblies_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_assemblies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "community_tour_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      city_geo_units: {
        Row: {
          active_listings: number | null
          centroid_lat: number | null
          centroid_lng: number | null
          community_count: number | null
          hero_storage_path: string | null
          id: string | null
          level: string | null
          median_list_price: number | null
          median_sample_size: number | null
          name: string | null
          sample_community_names: string[] | null
          state: string | null
        }
        Relationships: []
      }
      community_like_counts: {
        Row: {
          community_id: string | null
          like_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_video_membership: {
        Row: {
          community_id: string | null
          link_kind: string | null
          video_id: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      listing_like_counts: {
        Row: {
          like_count: number | null
          listing_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_likes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_community_counts: {
        Row: {
          community_id: string | null
          save_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_communities_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listing_counts: {
        Row: {
          listing_id: string | null
          save_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      claim_community: {
        Args: { p_community_id: string }
        Returns: {
          attributes: string[] | null
          avg_age: string | null
          avg_income: string | null
          boundary: Json | null
          boundary_source: string | null
          builder: string | null
          city: string | null
          county: string | null
          cover_storage_path: string | null
          cover_video_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          hero_image_url: string | null
          highlights: string[] | null
          hoa_fee_monthly: number | null
          homeowners_pct: string | null
          id: string
          interests: string[] | null
          kind: string
          lat: number | null
          lng: number | null
          median_home_value: string | null
          name: string
          narration_voice: string | null
          nearby: Json | null
          nextdoor_id: string | null
          nextdoor_slug: string | null
          nextdoor_url: string | null
          price_max: number | null
          price_min: number | null
          property_types: string[] | null
          residents_count: string | null
          seeded_at: string | null
          slug: string
          source: string
          state: string
          status: string
          updated_at: string
          website: string | null
          year_built: number | null
          year_built_end: number | null
          zip: string | null
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_k12_school_pipeline: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          distance_km: number
          gs_rating: number
          in_zone: boolean
          level: string
          name: string
          school_id: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
