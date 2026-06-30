import {
  compileEquitrustCoreRules,
  EQUITRUST_CONFIGURABLE_RULES,
  EQUITRUST_CORE_RULE_IDS,
} from "../rule-config";

export {
  equitrustMarketEarlyNJ,
  getLocationForRule,
  RULE_LOCATION_KEYS,
  FORM_NAME,
} from "./equitrust-template-metadata";

export { EQUITRUST_CONFIGURABLE_RULES, EQUITRUST_CORE_RULE_IDS };

/** EquiTrust MarketEarly NJ validation rules compiled from structured configuration. */
export const equitrustMarketEarlyNjRules = compileEquitrustCoreRules();
