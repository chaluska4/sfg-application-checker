import type { AzureAnalyzeOperationOutput } from "../../ocr/map-azure-analyze-result";

export const azureLayoutAnalyzeSucceeded: AzureAnalyzeOperationOutput = {
  status: "succeeded",
  analyzeResult: {
    content:
      "Individual Annuity Application\nOwner Information First Name John Last Name Smith\nSocial Security Number 123-45-6789",
    pages: [
      {
        pageNumber: 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        lines: [
          {
            content: "Individual Annuity Application",
            polygon: [1, 1, 7, 1, 7, 1.4, 1, 1.4],
            spans: [{ offset: 0, length: 30 }],
          },
        ],
        words: [
          {
            content: "Individual",
            polygon: [1, 1, 2.2, 1, 2.2, 1.4, 1, 1.4],
            confidence: 0.97,
            span: { offset: 0, length: 10 },
          },
          {
            content: "Application",
            polygon: [5.5, 1, 7, 1, 7, 1.4, 5.5, 1.4],
            confidence: 0.93,
            span: { offset: 20, length: 11 },
          },
        ],
      },
      {
        pageNumber: 2,
        width: 8.5,
        height: 11,
        unit: "inch",
        lines: [
          {
            content: "Owner Information First Name John Last Name Smith",
            polygon: [1.2, 2.2, 6.8, 2.2, 6.8, 2.6, 1.2, 2.6],
            spans: [{ offset: 31, length: 47 }],
          },
          {
            content: "Social Security Number 123-45-6789",
            polygon: [1.2, 3.1, 5.5, 3.1, 5.5, 3.5, 1.2, 3.5],
            spans: [{ offset: 79, length: 34 }],
          },
        ],
        words: [
          {
            content: "Owner",
            polygon: [1.2, 2.2, 1.8, 2.2, 1.8, 2.6, 1.2, 2.6],
            confidence: 0.96,
            span: { offset: 31, length: 5 },
          },
          {
            content: "Smith",
            polygon: [6.1, 2.2, 6.8, 2.2, 6.8, 2.6, 6.1, 2.6],
            confidence: 0.91,
            span: { offset: 72, length: 5 },
          },
          {
            content: "123-45-6789",
            polygon: [4.5, 3.1, 5.5, 3.1, 5.5, 3.5, 4.5, 3.5],
            confidence: 0.88,
            span: { offset: 102, length: 11 },
          },
        ],
        selectionMarks: [
          {
            state: "selected",
            polygon: [0.8, 4.1, 1, 4.1, 1, 4.3, 0.8, 4.3],
            confidence: 0.94,
          },
          {
            state: "unselected",
            polygon: [1.2, 4.1, 1.4, 4.1, 1.4, 4.3, 1.2, 4.3],
            confidence: 0.9,
          },
        ],
      },
    ],
  },
};

export const azureLayoutAnalyzeRunning: AzureAnalyzeOperationOutput = {
  status: "running",
};
