export interface OwnerFeatures {
  whatsapp_automation?: boolean;
  monthly_view?: boolean;
  worker_management?: boolean;
  payment_edit?: boolean;
}

export const DEFAULT_OWNER_FEATURES: OwnerFeatures = {
  whatsapp_automation: false,
  monthly_view: true,
  worker_management: true,
  payment_edit: false,
};