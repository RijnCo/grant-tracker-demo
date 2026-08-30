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

export const stateAwardTypeLabel = (v) => STATE_AWARD_TYPES[v] || v || '—'
export const revenueFundTypeLabel = (v) => REVENUE_FUND_TYPES[v] || v || '—'
export const amendmentTypeLabel = (v) => AMENDMENT_TYPES[v] || v || '—'
export const craTxnTypeLabel = (v) => CRA_TXN_TYPES[v] || v || '—'
export const craCategoryLabel = (v) => CRA_CATEGORIES[v] || v || '—'
export const craEngagementTypeLabel = (v) => CRA_ENGAGEMENT_TYPES[v] || v || '—'
export const craFundingTypeLabel = (v) => CRA_FUNDING_TYPES[v] || v || '—'
