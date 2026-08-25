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

export const stateAwardTypeLabel = (v) => STATE_AWARD_TYPES[v] || v || '—'
export const amendmentTypeLabel = (v) => AMENDMENT_TYPES[v] || v || '—'
export const craTxnTypeLabel = (v) => CRA_TXN_TYPES[v] || v || '—'
