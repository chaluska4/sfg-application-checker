import type { ExtractedField } from "../validation/types";

/**
 * Extract AcroForm fields from a PDF buffer using pdf-lib.
 */
export async function extractPdfFields(pdfBuffer: ArrayBuffer): Promise<{
  fields: ExtractedField[];
  hasFillableFields: boolean;
}> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  let formFields: ReturnType<typeof form.getFields>;
  try {
    formFields = form.getFields();
  } catch {
    return { fields: [], hasFillableFields: false };
  }

  if (formFields.length === 0) {
    return { fields: [], hasFillableFields: false };
  }

  const fields: ExtractedField[] = formFields.map((field) => {
    const name = field.getName();
    let value = "";
    let type = "unknown";

    try {
      const ctor = field.constructor.name;
      type = ctor;

      if (ctor === "PDFTextField") {
        value = (field as import("pdf-lib").PDFTextField).getText() ?? "";
      } else if (ctor === "PDFCheckBox") {
        const checked = (field as import("pdf-lib").PDFCheckBox).isChecked();
        value = checked ? "Yes" : "";
        type = "checkbox";
      } else if (ctor === "PDFDropdown") {
        const selected = (field as import("pdf-lib").PDFDropdown).getSelected();
        value = selected.length > 0 ? selected.join(", ") : "";
        type = "dropdown";
      } else if (ctor === "PDFRadioGroup") {
        const selected = (field as import("pdf-lib").PDFRadioGroup).getSelected();
        value = selected ?? "";
        type = "radio";
      } else if (ctor === "PDFOptionList") {
        const selected = (field as import("pdf-lib").PDFOptionList).getSelected();
        value = selected.length > 0 ? selected.join(", ") : "";
        type = "optionlist";
      } else if (ctor === "PDFSignature") {
        value = "";
        type = "signature";
      } else {
        try {
          const textField = form.getTextField(name);
          value = textField.getText() ?? "";
          type = "text";
        } catch {
          value = "";
        }
      }
    } catch {
      value = "";
    }

    return { name, value: value.trim(), type };
  });

  return { fields, hasFillableFields: fields.length > 0 };
}
