export const fillablePacketText = `
Individual Annuity Application
Owner Information First Name John Last Name Smith
Annuitant Information Social Security Number 123-45-6789
Beneficiary Designation Primary Beneficiary Jane Smith
Tax Qualification IRA
Premium Payment $100,000.00
MarketEarly Income Index
Agent Name Producer Jane Agent
Owner Signature eSigned Signed By John Smith Date 03/15/2026
Agent Signature eSigned Signed By Jane Agent Date 03/15/2026
Product Disclosure Statement Signature eSigned Date 03/15/2026
Initial Premium Allocation 60% Fixed Account 40% Index Account
Financial Needs Analysis Risk Tolerance Moderate
Source of Funds Savings Distribution Objectives Income
Insurance Agent Producer Disclosure
Acknowledgments and Signatures
`;

export const scannedImageOnlyPacket = { pages: [], fullText: "", hasEmbeddedText: false };

export const mixedEsignPacketText = `
EquiTrust MarketEarly Income Index NJ
Individual Annuity Application Owner Information
Annuitant Social Security Number present
Replacement existing coverage Yes
1035 Transfer Yes
Initial Premium Allocation 50% 50%
Financial Needs Analysis Source of Funds Other please explain rollover
Disclosure and Comparison of Products
Replacement Notice
Transfer 1035 Exchange Form
`;

export const replacementCaseText = `
Individual Annuity Application
Existing coverage replacement Yes replacing annuity
Replacement Notice Disclosure Comparison of Products
Owner Signature eSigned Signed By Owner Name
`;

export const transferCaseText = `
Individual Annuity Application
1035 Exchange Transfer Yes
Transfer Request Form
Premium Payment $250,000
`;
