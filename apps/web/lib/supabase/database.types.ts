export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
          lat: number | null
          lng: number | null
          median_home_value: string | null
          name: string
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
          lat?: number | null
          lng?: number | null
          median_home_value?: string | null
          name: string
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
          lat?: number | null
          lng?: number | null
          median_home_value?: string | null
          name?: string
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
          geom: unknown | null
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
          geom?: unknown | null
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
          geom?: unknown | null
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
          id: string
          listing_id: string
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
          id?: string
          listing_id: string
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
          id?: string
          listing_id?: string
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
          poi_id: string
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
          poi_id: string
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
          poi_id?: string
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
          location: unknown | null
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
          location?: unknown | null
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
          location?: unknown | null
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
          status: string
          updated_at: string
          video_row_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          listing_id: string
          orientations?: string[] | null
          status?: string
          updated_at?: string
          video_row_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          engine?: string | null
          error?: string | null
          id?: string
          listing_id?: string
          orientations?: string[] | null
          status?: string
          updated_at?: string
          video_row_id?: string
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
            foreignKeyName: "render_jobs_video_row_id_fkey"
            columns: ["video_row_id"]
            isOneToOne: false
            referencedRelation: "listing_videos"
            referencedColumns: ["id"]
          },
        ]
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
          cf_stream_uid: string | null
          community_id: string
          created_at: string
          error: string | null
          id: string
          ordered_clips: Json
          photos_dropped: Json
          run_id: string
          status: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          cf_stream_uid?: string | null
          community_id: string
          created_at?: string
          error?: string | null
          id?: string
          ordered_clips?: Json
          photos_dropped?: Json
          run_id: string
          status?: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          cf_stream_uid?: string | null
          community_id?: string
          created_at?: string
          error?: string | null
          id?: string
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
          f_geography_column: unknown | null
          f_table_catalog: unknown | null
          f_table_name: unknown | null
          f_table_schema: unknown | null
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown | null
          f_table_catalog: string | null
          f_table_name: unknown | null
          f_table_schema: unknown | null
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown | null
          f_table_catalog?: string | null
          f_table_name?: unknown | null
          f_table_schema?: unknown | null
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown | null
          f_table_catalog?: string | null
          f_table_name?: unknown | null
          f_table_schema?: unknown | null
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
        Args: {
          oldname: string
          newname: string
          version: string
        }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: {
          tbl: unknown
          col: string
        }
        Returns: unknown
      }
      _postgis_pgsql_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      _postgis_scripts_pgsql_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      _postgis_selectivity: {
        Args: {
          tbl: unknown
          att_name: string
          geom: unknown
          mode?: string
        }
        Returns: number
      }
      _st_3dintersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_bestsrid: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      _st_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_coveredby:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      _st_covers:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      _st_crosses: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
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
      _st_equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_intersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: {
          line1: unknown
          line2: unknown
        }
        Returns: number
      }
      _st_longestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      _st_orderingequals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_pointoutside: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      _st_sortablehash: {
        Args: {
          geom: unknown
        }
        Returns: number
      }
      _st_touches: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          g1: unknown
          clip?: unknown
          tolerance?: number
          return_polygons?: boolean
        }
        Returns: unknown
      }
      _st_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      addauth: {
        Args: {
          "": string
        }
        Returns: boolean
      }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
              column_name: string
              new_srid_in: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
              column_name: string
              new_srid: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
              column_name: string
              new_srid: number
              new_type: string
              new_dim: number
              use_typmod?: boolean
            }
            Returns: string
          }
      box:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box2d:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box2d_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2d_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2df_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box2df_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3d:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      box3d_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3d_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      box3dtobox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      bytea:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      claim_community: {
        Args: {
          p_community_id: string
        }
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
          lat: number | null
          lng: number | null
          median_home_value: string | null
          name: string
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
      }
      disablelongtransactions: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
              column_name: string
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
              column_name: string
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
              column_name: string
            }
            Returns: string
          }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              table_name: string
            }
            Returns: string
          }
      enablelongtransactions: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geography:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      geography_analyze: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      geography_gist_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_gist_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      geography_spgist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geography_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      geography_typmod_out: {
        Args: {
          "": number
        }
        Returns: unknown
      }
      geometry:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      geometry_above: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_analyze: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      geometry_below: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_cmp: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_contained_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      geometry_eq: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_ge: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_gist_compress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_decompress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_decompress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_gist_sortsupport_2d: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      geometry_gt: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_hash: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      geometry_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_le: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_left: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_lt: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_overabove: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overleft: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_overright: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_recv: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_right: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_same: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometry_send: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      geometry_sortsupport: {
        Args: {
          "": unknown
        }
        Returns: undefined
      }
      geometry_spgist_compress_2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_spgist_compress_3d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_spgist_compress_nd: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      geometry_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
      geometry_typmod_out: {
        Args: {
          "": number
        }
        Returns: unknown
      }
      geometry_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      geometrytype:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      geomfromewkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      geomfromewkt: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      get_k12_school_pipeline: {
        Args: {
          p_lat: number
          p_lng: number
        }
        Returns: {
          level: string
          school_id: string
          name: string
          gs_rating: number
          distance_km: number
          in_zone: boolean
        }[]
      }
      get_proj4_from_srid: {
        Args: {
          "": number
        }
        Returns: string
      }
      gettransactionid: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      gidx_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gidx_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      json: {
        Args: {
          "": unknown
        }
        Returns: Json
      }
      jsonb: {
        Args: {
          "": unknown
        }
        Returns: Json
      }
      longtransactionsenabled: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      path: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_asflatgeobuf_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asgeobuf_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asmvt_finalfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_asmvt_serialfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      pgis_geometry_clusterintersecting_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown[]
      }
      pgis_geometry_clusterwithin_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown[]
      }
      pgis_geometry_collect_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_makeline_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_polygonize_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_union_parallel_finalfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      pgis_geometry_union_parallel_serialfn: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      point: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      polygon: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      populate_geometry_columns:
        | {
            Args: {
              tbl_oid: unknown
              use_typmod?: boolean
            }
            Returns: number
          }
        | {
            Args: {
              use_typmod?: boolean
            }
            Returns: string
          }
      postgis_addbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_constraint_dims: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: number
      }
      postgis_constraint_type: {
        Args: {
          geomschema: string
          geomtable: string
          geomcolumn: string
        }
        Returns: string
      }
      postgis_dropbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_extensions_upgrade: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_full_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_geos_noop: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_geos_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_getbbox: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_hasbbox: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      postgis_index_supportfn: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_lib_build_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_lib_revision: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_lib_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libjson_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_liblwgeom_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libprotobuf_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_libxml_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_noop: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      postgis_proj_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_build_date: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_installed: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_scripts_released: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_svn_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_type_name: {
        Args: {
          geomname: string
          coord_dimension: number
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_typmod_dims: {
        Args: {
          "": number
        }
        Returns: number
      }
      postgis_typmod_srid: {
        Args: {
          "": number
        }
        Returns: number
      }
      postgis_typmod_type: {
        Args: {
          "": number
        }
        Returns: string
      }
      postgis_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      postgis_wagyu_version: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      spheroid_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      spheroid_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_3dclosestpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3ddistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_3dintersects: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_3dlength: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_3dlongestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_3dperimeter: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_3dshortestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_addpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_angle:
        | {
            Args: {
              line1: unknown
              line2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              pt1: unknown
              pt2: unknown
              pt3: unknown
              pt4?: unknown
            }
            Returns: number
          }
      st_area:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_area2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_asbinary:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_asencodedpolyline: {
        Args: {
          geom: unknown
          nprecision?: number
        }
        Returns: string
      }
      st_asewkb: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_asewkt:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_asgeojson:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              r: Record<string, unknown>
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
            }
            Returns: string
          }
      st_asgml:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              options?: number
            }
            Returns: string
          }
        | {
            Args: {
              version: number
              geog: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
        | {
            Args: {
              version: number
              geom: unknown
              maxdecimaldigits?: number
              options?: number
              nprefix?: string
              id?: string
            }
            Returns: string
          }
      st_ashexewkb: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_askml:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              maxdecimaldigits?: number
              nprefix?: string
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxdecimaldigits?: number
              nprefix?: string
            }
            Returns: string
          }
      st_aslatlontext: {
        Args: {
          geom: unknown
          tmpl?: string
        }
        Returns: string
      }
      st_asmarc21: {
        Args: {
          geom: unknown
          format?: string
        }
        Returns: string
      }
      st_asmvtgeom: {
        Args: {
          geom: unknown
          bounds: unknown
          extent?: number
          buffer?: number
          clip_geom?: boolean
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              geog: unknown
              rel?: number
              maxdecimaldigits?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              rel?: number
              maxdecimaldigits?: number
            }
            Returns: string
          }
      st_astext:
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_astwkb:
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_z?: number
              prec_m?: number
              with_sizes?: boolean
              with_boxes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_z?: number
              prec_m?: number
              with_sizes?: boolean
              with_boxes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: {
          geom: unknown
          maxdecimaldigits?: number
          options?: number
        }
        Returns: string
      }
      st_azimuth:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
      st_boundary: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_boundingdiagonal: {
        Args: {
          geom: unknown
          fits?: boolean
        }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: {
              geom: unknown
              radius: number
              options?: string
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              radius: number
              quadsegs: number
            }
            Returns: unknown
          }
      st_buildarea: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_centroid:
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
      st_cleangeometry: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_clipbybox2d: {
        Args: {
          geom: unknown
          box: unknown
        }
        Returns: unknown
      }
      st_closestpoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_clusterintersecting: {
        Args: {
          "": unknown[]
        }
        Returns: unknown[]
      }
      st_collect:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
      st_collectionextract: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_collectionhomogenize: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_concavehull: {
        Args: {
          param_geom: unknown
          param_pctconvex: number
          param_allow_holes?: boolean
        }
        Returns: unknown
      }
      st_contains: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_containsproperly: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_convexhull: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_coorddim: {
        Args: {
          geometry: unknown
        }
        Returns: number
      }
      st_coveredby:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_covers:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_crosses: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_curvetoline: {
        Args: {
          geom: unknown
          tol?: number
          toltype?: number
          flags?: number
        }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: {
          g1: unknown
          tolerance?: number
          flags?: number
        }
        Returns: unknown
      }
      st_difference: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_dimension: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_disjoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_distance:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
      st_distancesphere:
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
              radius: number
            }
            Returns: number
          }
      st_distancespheroid: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_dump: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumppoints: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumprings: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
      }
      st_dumpsegments: {
        Args: {
          "": unknown
        }
        Returns: Database["public"]["CompositeTypes"]["geometry_dump"][]
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
      st_endpoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_envelope: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_equals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_expand:
        | {
            Args: {
              box: unknown
              dx: number
              dy: number
            }
            Returns: unknown
          }
        | {
            Args: {
              box: unknown
              dx: number
              dy: number
              dz?: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              dx: number
              dy: number
              dz?: number
              dm?: number
            }
            Returns: unknown
          }
      st_exteriorring: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_flipcoordinates: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_force2d: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_force3d: {
        Args: {
          geom: unknown
          zvalue?: number
        }
        Returns: unknown
      }
      st_force3dm: {
        Args: {
          geom: unknown
          mvalue?: number
        }
        Returns: unknown
      }
      st_force3dz: {
        Args: {
          geom: unknown
          zvalue?: number
        }
        Returns: unknown
      }
      st_force4d: {
        Args: {
          geom: unknown
          zvalue?: number
          mvalue?: number
        }
        Returns: unknown
      }
      st_forcecollection: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcecurve: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcepolygonccw: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcepolygoncw: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcerhr: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_forcesfs: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_generatepoints:
        | {
            Args: {
              area: unknown
              npoints: number
            }
            Returns: unknown
          }
        | {
            Args: {
              area: unknown
              npoints: number
              seed: number
            }
            Returns: unknown
          }
      st_geogfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geogfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geographyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geohash:
        | {
            Args: {
              geog: unknown
              maxchars?: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              maxchars?: number
            }
            Returns: string
          }
      st_geomcollfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomcollfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geometricmedian: {
        Args: {
          g: unknown
          tolerance?: number
          max_iter?: number
          fail_if_not_converged?: boolean
        }
        Returns: unknown
      }
      st_geometryfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geometrytype: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_geomfromewkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromewkt: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromgeojson:
        | {
            Args: {
              "": Json
            }
            Returns: unknown
          }
        | {
            Args: {
              "": Json
            }
            Returns: unknown
          }
        | {
            Args: {
              "": string
            }
            Returns: unknown
          }
      st_geomfromgml: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromkml: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfrommarc21: {
        Args: {
          marc21xml: string
        }
        Returns: unknown
      }
      st_geomfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromtwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_geomfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_gmltosql: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_hasarc: {
        Args: {
          geometry: unknown
        }
        Returns: boolean
      }
      st_hausdorffdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_hexagon: {
        Args: {
          size: number
          cell_i: number
          cell_j: number
          origin?: unknown
        }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: {
          size: number
          bounds: unknown
        }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: {
          line: unknown
          point: unknown
        }
        Returns: number
      }
      st_intersection: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_intersects:
        | {
            Args: {
              geog1: unknown
              geog2: unknown
            }
            Returns: boolean
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: boolean
          }
      st_isclosed: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_iscollection: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isempty: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_ispolygonccw: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_ispolygoncw: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isring: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_issimple: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isvalid: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_isvaliddetail: {
        Args: {
          geom: unknown
          flags?: number
        }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
      }
      st_isvalidreason: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      st_isvalidtrajectory: {
        Args: {
          "": unknown
        }
        Returns: boolean
      }
      st_length:
        | {
            Args: {
              "": string
            }
            Returns: number
          }
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_length2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_letters: {
        Args: {
          letters: string
          font?: Json
        }
        Returns: unknown
      }
      st_linecrossingdirection: {
        Args: {
          line1: unknown
          line2: unknown
        }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: {
          txtin: string
          nprecision?: number
        }
        Returns: unknown
      }
      st_linefrommultipoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_linefromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linelocatepoint: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_linemerge: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_linestringfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_linetocurve: {
        Args: {
          geometry: unknown
        }
        Returns: unknown
      }
      st_locatealong: {
        Args: {
          geometry: unknown
          measure: number
          leftrightoffset?: number
        }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          geometry: unknown
          frommeasure: number
          tomeasure: number
          leftrightoffset?: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: {
          geometry: unknown
          fromelevation: number
          toelevation: number
        }
        Returns: unknown
      }
      st_longestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_m: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_makebox2d: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_makeline:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
      st_makepolygon: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_makevalid:
        | {
            Args: {
              "": unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              params: string
            }
            Returns: unknown
          }
      st_maxdistance: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: number
      }
      st_maximuminscribedcircle: {
        Args: {
          "": unknown
        }
        Returns: Record<string, unknown>
      }
      st_memsize: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: {
          inputgeom: unknown
          segs_per_quarter?: number
        }
        Returns: unknown
      }
      st_minimumboundingradius: {
        Args: {
          "": unknown
        }
        Returns: Record<string, unknown>
      }
      st_minimumclearance: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_minimumclearanceline: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_mlinefromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mlinefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpolyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_mpolyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multi: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_multilinefromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multilinestringfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipolyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_multipolygonfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_ndims: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_node: {
        Args: {
          g: unknown
        }
        Returns: unknown
      }
      st_normalize: {
        Args: {
          geom: unknown
        }
        Returns: unknown
      }
      st_npoints: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_nrings: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numgeometries: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numinteriorring: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numinteriorrings: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numpatches: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_numpoints: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_offsetcurve: {
        Args: {
          line: unknown
          distance: number
          params?: string
        }
        Returns: unknown
      }
      st_orderingequals: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_orientedenvelope: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_overlaps: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_perimeter:
        | {
            Args: {
              "": unknown
            }
            Returns: number
          }
        | {
            Args: {
              geog: unknown
              use_spheroid?: boolean
            }
            Returns: number
          }
      st_perimeter2d: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_pointfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_pointfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_pointm: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          mcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_pointonsurface: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_points: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
          mcoordinate: number
          srid?: number
        }
        Returns: unknown
      }
      st_polyfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polyfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonfromtext: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonfromwkb: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_polygonize: {
        Args: {
          "": unknown[]
        }
        Returns: unknown
      }
      st_project: {
        Args: {
          geog: unknown
          distance: number
          azimuth: number
        }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_x: number
          prec_y?: number
          prec_z?: number
          prec_m?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: {
          geom: unknown
          gridsize: number
        }
        Returns: unknown
      }
      st_relate: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: string
      }
      st_removerepeatedpoints: {
        Args: {
          geom: unknown
          tolerance?: number
        }
        Returns: unknown
      }
      st_reverse: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_segmentize: {
        Args: {
          geog: unknown
          max_segment_length: number
        }
        Returns: unknown
      }
      st_setsrid:
        | {
            Args: {
              geog: unknown
              srid: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              srid: number
            }
            Returns: unknown
          }
      st_sharedpaths: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_shiftlongitude: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_shortestline: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: {
          geom: unknown
          vertex_fraction: number
          is_outer?: boolean
        }
        Returns: unknown
      }
      st_split: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_square: {
        Args: {
          size: number
          cell_i: number
          cell_j: number
          origin?: unknown
        }
        Returns: unknown
      }
      st_squaregrid: {
        Args: {
          size: number
          bounds: unknown
        }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | {
            Args: {
              geog: unknown
            }
            Returns: number
          }
        | {
            Args: {
              geom: unknown
            }
            Returns: number
          }
      st_startpoint: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      st_subdivide: {
        Args: {
          geom: unknown
          maxvertices?: number
          gridsize?: number
        }
        Returns: unknown[]
      }
      st_summary:
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      st_swapordinates: {
        Args: {
          geom: unknown
          ords: unknown
        }
        Returns: unknown
      }
      st_symdifference: {
        Args: {
          geom1: unknown
          geom2: unknown
          gridsize?: number
        }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          zoom: number
          x: number
          y: number
          bounds?: unknown
          margin?: number
        }
        Returns: unknown
      }
      st_touches: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_transform:
        | {
            Args: {
              geom: unknown
              from_proj: string
              to_proj: string
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              from_proj: string
              to_srid: number
            }
            Returns: unknown
          }
        | {
            Args: {
              geom: unknown
              to_proj: string
            }
            Returns: unknown
          }
      st_triangulatepolygon: {
        Args: {
          g1: unknown
        }
        Returns: unknown
      }
      st_union:
        | {
            Args: {
              "": unknown[]
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
            }
            Returns: unknown
          }
        | {
            Args: {
              geom1: unknown
              geom2: unknown
              gridsize: number
            }
            Returns: unknown
          }
      st_voronoilines: {
        Args: {
          g1: unknown
          tolerance?: number
          extend_to?: unknown
        }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: {
          g1: unknown
          tolerance?: number
          extend_to?: unknown
        }
        Returns: unknown
      }
      st_within: {
        Args: {
          geom1: unknown
          geom2: unknown
        }
        Returns: boolean
      }
      st_wkbtosql: {
        Args: {
          wkb: string
        }
        Returns: unknown
      }
      st_wkttosql: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      st_wrapx: {
        Args: {
          geom: unknown
          wrap: number
          move: number
        }
        Returns: unknown
      }
      st_x: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_xmax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_xmin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_y: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_ymax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_ymin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_z: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmax: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmflag: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      st_zmin: {
        Args: {
          "": unknown
        }
        Returns: number
      }
      text: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      unlockrows: {
        Args: {
          "": string
        }
        Returns: number
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          schema_name: string
          table_name: string
          column_name: string
          new_srid_in: number
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
        geom: unknown | null
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown | null
      }
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

