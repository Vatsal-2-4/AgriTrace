export const ROLE_HOME = {
  FARMER: '/farmer',
  SELLER: '/buyer',
  BUYER: '/buyer',
  RETAILER: '/buyer',
  WHOLESALER: '/buyer',
  PROCESSOR: '/buyer',
  QUALITY_INSPECTOR: '/quality',
  WAREHOUSE: '/storage',
  TRANSPORT: '/logistics',
  PROCESSING_UNIT: '/buyer',
  EDUCATOR: '/farmer'
};

export function getRoleHome(role) {
  return ROLE_HOME[role] || ROLE_HOME.FARMER;
}
