export const APP_CONFIG = {
  appName: (import.meta.env.VITE_APP_NAME as string) || "CRM",
  companyName: (import.meta.env.VITE_COMPANY_NAME as string) || "",
  modulePonteggi: import.meta.env.VITE_MODULE_PONTEGGI !== "false",
  moduleProxit: import.meta.env.VITE_MODULE_PROXIT !== "false",
  moduleAmministrazione: import.meta.env.VITE_MODULE_AMMINISTRAZIONE !== "false",
};
