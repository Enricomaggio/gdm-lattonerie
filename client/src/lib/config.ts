export const APP_CONFIG = {
  appName: (import.meta.env.VITE_APP_NAME as string) || "CRM",
  companyName: (import.meta.env.VITE_COMPANY_NAME as string) || "",
  modulePonteggi: import.meta.env.VITE_MODULE_PONTEGGI !== "false",
  moduleProxit: import.meta.env.VITE_MODULE_PROXIT !== "false",
  moduleAmministrazione: import.meta.env.VITE_MODULE_AMMINISTRAZIONE !== "false",
  moduleProgetti: import.meta.env.VITE_MODULE_PROGETTI === "true",
  moduleSAL: import.meta.env.VITE_MODULE_SAL === "true",
  moduleBillingProfiles: import.meta.env.VITE_MODULE_BILLING_PROFILES === "true",
  moduleExternalEngineers: import.meta.env.VITE_MODULE_EXTERNAL_ENGINEERS === "true",
  moduleClausole: import.meta.env.VITE_MODULE_CLAUSOLE === "true",
  quoteEditorType: (import.meta.env.VITE_QUOTE_EDITOR_TYPE as string) || "scaffolding",
};
