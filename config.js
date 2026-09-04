/*
 * JobFinder frontend configuration.
 *
 * Use ONLY the Supabase publishable key (or legacy anon key) here.
 * Never place a service_role key in a browser application.
 */
window.JOBFINDER_CONFIG = {
  supabaseUrl: "https://moyabdwxlbkfqmtjuwwa.supabase.co",
  supabasePublishableKey: "sb_publishable_kzopFoXWx_DBRo8giCgGDg_ITMsOsbV",

  /* Optional absolute GitHub Pages URL, e.g. https://username.github.io/jobfinder/
     Leave empty to use the current page URL for OAuth and password recovery. */
  siteUrl: "",

  /* Keep false in production. If true and Supabase is not configured, JobFinder
     loads clearly-labelled local demo data and disables remote writes. */
  demoMode: false,

  /* Change mappings here only if existing Supabase columns use different names. */
  schema: {
    tables: {
      profiles: { name: "profiles", ownerColumn: "id" },
      companies: { name: "companies", ownerColumn: "user_id" },
      jobs: { name: "jobs", ownerColumn: "user_id" },
      feedback: { name: "feedback", ownerColumn: "user_id" },
      applications: { name: "applications", ownerColumn: "user_id" },
      contacts: { name: "contacts", ownerColumn: "user_id" },
      followups: { name: "followups", ownerColumn: "user_id" },
      answerBank: { name: "answer_bank", ownerColumn: "user_id" },
      preferences: { name: "search_preferences", ownerColumn: "user_id" }
    },
    columns: {
      profiles: {
        name: "full_name",
        email: "email"
      },
      companies: {
        name: "name",
        sector: "sector",
        logoUrl: "logo_url",
        tier: "tier",
        website: "website",
        notes: "notes",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      jobs: {
        title: "title",
        companyId: "company_id",
        companyName: "company_name",
        location: "location",
        fitScore: "fit_score",
        status: "status",
        priority: "priority",
        source: "source",
        url: "url",
        saved: "is_saved",
        whyFit: "why_fit",
        gaps: "gaps",
        angle: "angle",
        recommendedCv: "recommended_cv",
        industry: "industry",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      feedback: {
        jobId: "job_id",
        value: "feedback_type",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      applications: {
        jobId: "job_id",
        companyId: "company_id",
        status: "status",
        cvUsed: "cv_used",
        progress: "progress",
        appliedAt: "applied_at",
        notes: "notes",
        whyFit: "why_fit",
        gaps: "gaps",
        angle: "angle",
        recruiterNote: "recruiter_note",
        preparationStatus: "preparation_status",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      contacts: {
        name: "name",
        email: "email",
        companyId: "company_id",
        role: "role"
      },
      followups: {
        action: "action",
        jobId: "job_id",
        applicationId: "application_id",
        contactId: "contact_id",
        contactName: "contact_name",
        dueDate: "due_date",
        completed: "completed",
        notes: "notes",
        createdAt: "created_at",
        updatedAt: "updated_at"
      },
      answerBank: {
        title: "title",
        category: "category",
        content: "canonical_answer",
        updatedAt: "updated_at"
      },
      preferences: {
        roles: "target_roles",
        sectors: "target_sectors",
        locations: "locations",
        workModes: "work_modes",
        minFit: "min_fit_score",
        aiLearning: "ai_learning_enabled",
        updatedAt: "updated_at"
      }
    }
  }
};
