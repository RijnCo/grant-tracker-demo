// Human-readable labels for coded values coming out of the database.

export const STATE_AWARD_TYPES = {
  legislative_appropriation: 'Legislative appropriation',
  state_grant_agreement: 'State grant agreement',
  state_revolving_fund: 'State revolving fund',
  other: 'Other state assistance',
}

export const AMENDMENT_TYPES = {
  period_change: 'Period of performance',
  additional_funding: 'Funding change',
  combined: 'Period + funding',
  other: 'Other',
}

export const CRA_TXN_TYPES = {
  tif_increment: 'TIF increment',
  other_revenue: 'Other revenue',
  project_expense: 'Project expense',
  admin_expense: 'Admin expense',
}

export const CRA_CATEGORIES = {
  infrastructure: 'Infrastructure',
  streetscape: 'Streetscape',
  housing: 'Housing',
  business_assistance: 'Business assistance',
  parks_public_space: 'Parks & public space',
  transportation: 'Transportation',
  planning_admin: 'Planning & admin',
  other: 'Other',
}

export const CRA_ENGAGEMENT_TYPES = {
  survey: 'Survey',
  public_meeting: 'Public meeting',
  workshop: 'Workshop',
  open_house: 'Open house',
  charrette: 'Design charrette',
  other: 'Other',
}

export const CRA_FUNDING_TYPES = {
  tax_increment: 'Tax increment (TIF)',
  county_contribution: 'County contribution',
  grant: 'Grant',
  general_fund: 'General fund',
  interest: 'Interest',
  private_match: 'Private match',
  other: 'Other',
}

export const REVENUE_FUND_TYPES = {
  general: 'General Fund',
  enterprise: 'Enterprise funds',
  special_revenue: 'Special revenue & restricted',
}

export const BILLING_CATEGORIES = {
  meter_read_error: 'Meter read error',
  data_entry_error: 'Data entry error',
  broken_meter: 'Broken meter / equipment',
  leak_adjustment: 'Leak adjustment',
  overbilling: 'Overbilling',
  underbilling: 'Underbilling',
  unmetered_connection: 'Unmetered connection',
  inactive_account_usage: 'Inactive account w/ usage',
  meter_under_registration: 'Meter under-registration',
  other: 'Other',
}

export const BILLING_STATUSES = {
  new: 'New',
  under_review: 'Under review',
  pending_approval: 'Pending approval',
  resolved: 'Resolved',
}

export const BILLING_PRIORITIES = { low: 'Low', medium: 'Medium', high: 'High' }

export const BILLING_SERVICES = {
  water: 'Water',
  sewer: 'Sewer',
  gas: 'Gas',
  solid_waste: 'Solid waste',
}

export const BILLING_SOURCES = {
  customer: 'Customer report',
  field_audit: 'NRW field audit',
  reconciliation: 'Reconciliation',
}

export const BILLING_ADJUSTMENT_TYPES = {
  credit: 'Credit to customer',
  back_bill: 'Back-billing (recovery)',
  no_change: 'No change (denied/closed)',
}

export const APPROVAL_ROLES = {
  frontline: 'Frontline billing rep',
  supervisor: 'Billing ops supervisor',
  director_cfo: 'Department director / CFO',
}

export const BTR_STATUSES = {
  identified: 'Identified',
  notice_sent: 'Notice sent',
  registered: 'Registered',
  exempt: 'Exempt',
  referred: 'Referred (code enforcement)',
}

export const stateAwardTypeLabel = (v) => STATE_AWARD_TYPES[v] || v || '—'
export const revenueFundTypeLabel = (v) => REVENUE_FUND_TYPES[v] || v || '—'
export const billingCategoryLabel = (v) => BILLING_CATEGORIES[v] || v || '—'
export const billingStatusLabel = (v) => BILLING_STATUSES[v] || v || '—'
export const billingServiceLabel = (v) => BILLING_SERVICES[v] || v || '—'
export const billingSourceLabel = (v) => BILLING_SOURCES[v] || v || '—'
export const billingAdjTypeLabel = (v) => BILLING_ADJUSTMENT_TYPES[v] || v || '—'
export const approvalRoleLabel = (v) => APPROVAL_ROLES[v] || v || '—'
export const btrStatusLabel = (v) => BTR_STATUSES[v] || v || '—'
export const amendmentTypeLabel = (v) => AMENDMENT_TYPES[v] || v || '—'
export const craTxnTypeLabel = (v) => CRA_TXN_TYPES[v] || v || '—'
export const craCategoryLabel = (v) => CRA_CATEGORIES[v] || v || '—'
export const craEngagementTypeLabel = (v) => CRA_ENGAGEMENT_TYPES[v] || v || '—'
export const craFundingTypeLabel = (v) => CRA_FUNDING_TYPES[v] || v || '—'
