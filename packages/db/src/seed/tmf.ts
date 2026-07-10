/**
 * Illustrative subset of the CDISC TMF Reference Model taxonomy (ADR-0005).
 * Zone numbers/names follow the official model; section/artifact codes follow
 * the official numbering scheme but the selection and wording here are
 * illustrative, not a reproduction of the licensed model content.
 */
export interface TmfSeedZone {
  number: number;
  name: string;
  sections: { code: string; name: string; artifacts: { code: string; name: string }[] }[];
}

export const tmfSeed: TmfSeedZone[] = [
  {
    number: 1,
    name: "Trial Management",
    sections: [
      {
        code: "01.01",
        name: "Trial Oversight",
        artifacts: [
          { code: "01.01.01", name: "Trial Master File Plan" },
          { code: "01.01.02", name: "Trial Management Plan" },
          { code: "01.01.03", name: "Monitoring Plan" },
        ],
      },
      {
        code: "01.03",
        name: "Monitoring",
        artifacts: [{ code: "01.03.01", name: "Site Monitoring Visit Report" }],
      },
    ],
  },
  {
    number: 2,
    name: "Central Trial Documents",
    sections: [
      {
        code: "02.01",
        name: "Protocol and Amendments",
        artifacts: [
          { code: "02.01.01", name: "Protocol" },
          { code: "02.01.02", name: "Protocol Amendment" },
          { code: "02.01.03", name: "Protocol Signature Page" },
        ],
      },
      {
        code: "02.02",
        name: "Investigator's Brochure",
        artifacts: [{ code: "02.02.01", name: "Investigator's Brochure" }],
      },
      {
        code: "02.03",
        name: "Data Collection Instruments",
        artifacts: [{ code: "02.03.01", name: "Case Report Form (blank)" }],
      },
      {
        code: "02.04",
        name: "Informed Consent",
        artifacts: [{ code: "02.04.01", name: "Master Informed Consent Form" }],
      },
    ],
  },
  {
    number: 3,
    name: "Regulatory",
    sections: [
      {
        code: "03.01",
        name: "Regulatory Submissions",
        artifacts: [
          { code: "03.01.01", name: "Regulatory Submission (IND/CTA)" },
          { code: "03.01.02", name: "Regulatory Authority Approval" },
        ],
      },
      {
        code: "03.02",
        name: "Trial Registration",
        artifacts: [{ code: "03.02.01", name: "Clinical Trial Registration" }],
      },
    ],
  },
  {
    number: 4,
    name: "IRB/IEC and Other Approvals",
    sections: [
      {
        code: "04.01",
        name: "IRB/IEC Review",
        artifacts: [
          { code: "04.01.01", name: "IRB/IEC Submission" },
          { code: "04.01.02", name: "IRB/IEC Approval" },
          { code: "04.01.03", name: "IRB/IEC Continuing Review Approval" },
          { code: "04.01.04", name: "IRB/IEC-Approved Site Consent Form" },
          { code: "04.01.05", name: "IRB/IEC Membership Roster" },
        ],
      },
    ],
  },
  {
    number: 5,
    name: "Site Management",
    sections: [
      {
        code: "05.01",
        name: "Site Selection and Activation",
        artifacts: [
          { code: "05.01.01", name: "Site Selection Visit Report" },
          { code: "05.01.02", name: "Site Initiation Visit Report" },
          { code: "05.01.03", name: "Site Activation Notification" },
          { code: "05.01.04", name: "Clinical Trial Agreement" },
        ],
      },
      {
        code: "05.02",
        name: "Site Staff Qualification",
        artifacts: [
          { code: "05.02.01", name: "Curriculum Vitae" },
          { code: "05.02.02", name: "Medical License" },
          { code: "05.02.03", name: "GCP Training Certificate" },
          { code: "05.02.04", name: "Financial Disclosure Form" },
          { code: "05.02.05", name: "Form FDA 1572" },
        ],
      },
      {
        code: "05.03",
        name: "Site Operations",
        artifacts: [
          { code: "05.03.01", name: "Delegation of Authority Log" },
          { code: "05.03.02", name: "Site Signature Sheet" },
        ],
      },
    ],
  },
  {
    number: 6,
    name: "IP and Trial Supplies",
    sections: [
      {
        code: "06.01",
        name: "Investigational Product Management",
        artifacts: [
          { code: "06.01.01", name: "IP Shipment Record" },
          { code: "06.01.02", name: "IP Accountability Log" },
          { code: "06.01.03", name: "IP Storage Condition Log" },
          { code: "06.01.04", name: "Pharmacy Manual" },
        ],
      },
    ],
  },
  {
    number: 7,
    name: "Safety Reporting",
    sections: [
      {
        code: "07.01",
        name: "Safety Documentation",
        artifacts: [
          { code: "07.01.01", name: "SAE Report" },
          { code: "07.01.02", name: "Safety Notification to Investigators" },
          { code: "07.01.03", name: "DSMB Charter" },
        ],
      },
    ],
  },
  {
    number: 8,
    name: "Centralized and Local Testing",
    sections: [
      {
        code: "08.01",
        name: "Laboratory Documentation",
        artifacts: [
          { code: "08.01.01", name: "Laboratory Accreditation" },
          { code: "08.01.02", name: "Laboratory Normal Ranges" },
        ],
      },
    ],
  },
  {
    number: 9,
    name: "Third Parties",
    sections: [
      {
        code: "09.01",
        name: "Vendor Oversight",
        artifacts: [{ code: "09.01.01", name: "Vendor Contract" }],
      },
    ],
  },
  {
    number: 10,
    name: "Data Management",
    sections: [
      {
        code: "10.01",
        name: "Data Management Oversight",
        artifacts: [{ code: "10.01.01", name: "Data Management Plan" }],
      },
    ],
  },
  {
    number: 11,
    name: "Statistics",
    sections: [
      {
        code: "11.01",
        name: "Statistical Oversight",
        artifacts: [
          { code: "11.01.01", name: "Statistical Analysis Plan" },
          { code: "11.01.02", name: "Randomization Specification" },
        ],
      },
    ],
  },
];
