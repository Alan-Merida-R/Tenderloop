export const MEETING_TEMPLATES = {
  kickoff: `
  <h3>Kick-off Meeting</h3>
  <p><b>Description:</b> Scope definition</p>
  <p><b>Attendees:</b> </p>
  <hr>
  <h4>Key Questions</h4>
  <p><b>CSE:</b></p>
  <ul>
    <li>What is the scope?</li>
    <li>Purchase timeline?</li>
    <li>MSA/CFA exists?</li>
    <li>Target Margin?</li>
    <li>Proposal Type (Budgetary/Firm)?</li>
  </ul>
  <p><b>TSC:</b></p>
  <ul>
    <li>Information for BOM ready?</li>
    <li>Supply chain involvement needed?</li>
  </ul>
  <p><b>Delivery:</b></p>
  <ul>
    <li>Hours estimation possible?</li>
  </ul>
  <hr>
  <h4>Comments</h4>
  <p><br></p>
  `,

  scope: `
  <h3>Meeting to Define Scope</h3>
  <p><b>Objective:</b> Define technical boundaries</p>
  <p><b>Attendees:</b> CSE, TSC</p>
  <p><b>Resources:</b></p>
  <hr>
  <h4>General Meeting Checklist</h4>
  <p><input type="checkbox"> Scope (Included/Excluded)</p>
  <p><input type="checkbox"> Delivery vs Field Service</p>
  <p><input type="checkbox"> BOM Validation</p>
  <p><input type="checkbox"> Commercial Terms</p>
  <p><input type="checkbox"> MSA/CFA Check</p>
  <p><input type="checkbox"> Execution Plan</p>
  <hr>
  <h4>Comments</h4>
  <p><br></p>
  `,

  general: `
  <h3>General Meeting / Review</h3>
  <p><b>Objective:</b> </p>
  <p><b>Attendees:</b> </p>
  <p><b>Shared Resources:</b></p>
  <hr>
  <h4>Notes</h4>
  <p><br></p>
  <h4>Action Items</h4>
  <ol>
    <li></li>
    <li></li>
  </ol>
  `,

  "Industrial Proposal Checklist (Schneider) – Client Research + Structure": `
  <h3>Industrial Proposal Checklist</h3>
  <p><b>Objective:</b> Comprehensive checklist for high-value industrial proposals.</p>
  <hr>

  <h4>1. Proposal Essentials</h4>
  <ul>
    <li><b>Client:</b> [Startups / Enterprise / Gov?]</li>
    <li><b>Opportunity Name:</b> </li>
    <li><b>Submission Deadline:</b> </li>
    <li><b>Key Decision Makers:</b> [Technical / Economic]</li>
    <li><b>Schneider Owner (Sales):</b> </li>
    <li><b>Tender Lead:</b> </li>
  </ul>

  <h4>2. Client Research & Context</h4>
  <ul>
    <li><b>Company Profile:</b> [Brief summary of their business]</li>
    <li><b>Strategic Goals:</b> [What is their vision? Customization? Efficiency?]</li>
    <li><b>Recent News / Annual Report:</b> [Any relevant shutdowns, investments, or mergers?]</li>
    <li><b>Relationship History:</b> [New client or existing? Past wins/losses?]</li>
  </ul>

  <h4>3. ROI & Value Proposition</h4>
  <ul>
    <li><b>Customer Pain Points:</b> </li>
    <li><b>Our Solution's Impact:</b> [Energy saving? Process speed? Safety?]</li>
    <li><b>Why Schneider?</b> [Diffentiator vs. Competition]</li>
  </ul>

  <h4>4. Pricing & Commercial Strategy</h4>
  <ul>
    <li><b>Budget Indication:</b> [Do we know their budget?]</li>
    <li><b>Target Winning Price:</b> </li>
    <li><b>Pricing Strategy:</b> [Premium / Aggressive / Discounted?]</li>
    <li><b>Terms & Conditions:</b> [Any special penalties or payment terms?]</li>
  </ul>

  <h4>5. Scope Definition</h4>
  <ul>
    <li><b>Hardware (BOM):</b> [Validated?]</li>
    <li><b>Software:</b> [Licenses / Subscription?]</li>
    <li><b>Services:</b> [Commissioning / Training / Maintenance]</li>
    <li><b>Exclusions:</b> [What is strictly OUT of scope?]</li>
  </ul>

  <h4>6. Installed Base Opportunities</h4>
  <ul>
    <li><b>Existing Equipment:</b> [Is there Schneider legacy gear to modernize?]</li>
    <li><b>Competitor Replacement:</b> [Are we replacing Siemens/ABB/Rockwell?]</li>
  </ul>

  <h4>7. Collaboration & Internal Stakeholders</h4>
  <ul>
    <li><b>Required BU Support:</b> [Digital Energy / Power / Process Automation?]</li>
    <li><b>Approvals Needed:</b> [CQA / SOC / Legal?]</li>
  </ul>

  <h4>8. Delivery & Execution</h4>
  <ul>
    <li><b>Timeline:</b> [When do they need it delivered?]</li>
    <li><b>Resource Availability:</b> [Do we have engineers available?]</li>
    <li><b>Risks:</b> [Lead times / Technical complexity]</li>
  </ul>

  <h4>9. Pre-Mortem (Loss Analysis)</h4>
  <ul>
    <li><b>Why might we lose?</b> [Price / Compliance / Relationship]</li>
    <li><b>Mitigation Plan:</b> </li>
  </ul>

  <h4>10. Competitive Intelligence</h4>
  <ul>
    <li><b>Primary Competitor:</b> </li>
    <li><b>Their likely strategy:</b> </li>
    <li><b>Counter-arguments:</b> </li>
  </ul>
  `
};