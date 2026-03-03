import { Task } from '../types';

export const STANDARD_TASKS: Partial<Task>[] = [
    {
        title: "BFO SR Receive",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 1,
        subtasks: []
    },
    {
        title: "Fill in the internal notes",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 2,
        subtasks: [
            { id: "1", title: "Description of the Request", completed: true },
            { id: "2", title: "SRLink", completed: true },
            { id: "3", title: "OPLink", completed: true },
            { id: "4", title: "The first note in history", completed: true },
            { id: "5", title: "Set up KPIs", completed: true }
        ]
    },
    {
        title: "Create Quotelink number and link to SR",
        description: "Just put the Country",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 3,
        subtasks: []
    },
    {
        title: "Set up and manage project folder",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 4,
        subtasks: [
            { id: "1", title: "Create the folder", completed: true },
            { id: "2", title: "Enter the email address of the SR", completed: false }
        ]
    },
    {
        title: "Download CQA Import and Doc Template",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 5,   // was 4 (duplicate) → now 5
        subtasks: [
            { id: "1", title: "CQA template", completed: false },
            { id: "2", title: "Doc Template", completed: false }
        ]
    },
    {
        title: "Email structure setup",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 6,   // was 5
        calendarized: true
    },
    {
        title: "Create SR for TSC support",
        description: "",
        status: "Canceled",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 7,   // was 6
        subtasks: [
            { id: "1", title: "TSC", completed: false },
            { id: "2", title: "Delivery", completed: false },
            { id: "3", title: "SCM", completed: false },
            { id: "4", title: "Other", completed: false }
        ]
    },
    {
        title: "TSC Assigned to Opportunity",
        description: "",
        status: "Canceled",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 8,   // was 7
        subtasks: []
    },
    {
        title: "Review available information",
        description: "",
        status: "In Progress",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 9,   // was 8 (duplicate) → now 9
        subtasks: []
    },
    {
        title: "Check if there is an MSA of CFA.",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "External Area",
        externalAreas: ["Other", "Sales"],
        dueDate: "",
        order: 10,  // was 8 (duplicate) → now 10
        subtasks: []
    },
    {
        title: "Publish CQA",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 11,  // was 9
        subtasks: []
    },
    {
        title: "Receive the BOM",
        description: "",
        status: "Missing Info",
        priority: "Medium",
        owner: "External Area",
        externalAreas: ["TSC"],
        dueDate: "",
        order: 12,  // was 10
        subtasks: []
    },
    {
        title: "KOM",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 13,  // was 11
        subtasks: []
    },
    {
        title: "PLAN AND SCHEDULE TASKS",
        description: "",
        status: "Done",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 14,  // was 12
        subtasks: []
    },
    {
        title: "Generate/Finalize BOM (BuyAutomation)",
        description: "Based on the site survey",
        status: "Pending",
        priority: "High",
        owner: "External Area",
        externalAreas: ["Delivery", "TSC"],
        dueDate: "",
        order: 15,  // was 18
        subtasks: []
    },
    {
        title: "Create preliminary GEET for Delivery",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "External Area",
        externalAreas: ["TSC", "Other"],
        dueDate: "",
        order: 16,  // was 18 (duplicate) → now 16
        subtasks: []
    },
    {
        title: "Create PACost",
        description: "If you have BOM, have this before the meeting.",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 17,  // was 19
        subtasks: [
            { id: "1", title: "BOM Charged", completed: true }
        ]
    },
    {
        title: "Review meeting",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "External Area",
        externalAreas: ["Delivery", "SCM", "Sales", "TSC", "Other"],
        dueDate: "",
        order: 18,  // was 20
        subtasks: []
    },
    {
        title: "Consolidate costing (PACost)",
        description: "Steven Cadmus had to bring me the GEET actuaized \nDarin Fox had to send me the CFA because it's not yet in the sharepoint",
        status: "Pending",
        priority: "Medium",
        owner: "External Area",
        externalAreas: ["Delivery", "Sales"],
        dueDate: "",
        order: 19,  // was 21
        subtasks: [
            { id: "1", title: "BOM Charged", completed: true },
            { id: "2", title: "Delivery Hours charged", completed: true },
            { id: "3", title: "Discounts charged", completed: false },
            { id: "4", title: "Terms and condition", completed: true }
        ]
    },
    {
        title: "CQA Costing Consolidation",
        description: "It was not necesary",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 20,  // was 22
        subtasks: []
    },
    {
        title: "Price approval",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 21,  // was 23
        subtasks: []
    },
    {
        title: "Generate Preliminary Draft Proposal",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 22,  // was 24
        subtasks: []
    },
    {
        title: "Approval draft",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 23,  // was 25
        subtasks: []
    },
    {
        title: "Update date and table of contents",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 24,  // was 26
        subtasks: [
            { id: "1", title: "Table", completed: false },
            { id: "2", title: "Date", completed: false }
        ]
    },
    {
        title: "Convert to PDF and send to Sales",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 25,  // was 27
        subtasks: []
    },
    {
        title: "Update the emails in the folder",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 26,  // was 28
        subtasks: []
    },
    {
        title: "Close the SR",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 27,  // was 29
        subtasks: []
    },
    {
        title: "Update the amount and the quote link.",
        description: "",
        status: "Pending",
        priority: "Medium",
        owner: "Me",
        dueDate: "",
        order: 28,  // was 30
        subtasks: []
    }
];
