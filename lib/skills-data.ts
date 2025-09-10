// Comprehensive skills database compiled from O*NET taxonomy and professional domains
// Categories based on O*NET Content Model and industry standards

export const skillsData: { [key: string]: string[] } = {
  // Basic Skills (O*NET Category)
  "Basic Skills": [
    "Active Learning",
    "Active Listening", 
    "Critical Thinking",
    "Learning Strategies",
    "Mathematics",
    "Monitoring",
    "Reading Comprehension",
    "Science",
    "Speaking",
    "Writing"
  ],

  // Complex Problem Solving Skills
  "Problem Solving": [
    "Complex Problem Solving",
    "Systems Analysis",
    "Systems Evaluation",
    "Judgment and Decision Making",
    "Troubleshooting",
    "Root Cause Analysis",
    "Strategic Planning",
    "Risk Assessment"
  ],

  // Resource Management Skills
  "Resource Management": [
    "Management of Financial Resources",
    "Management of Material Resources", 
    "Management of Personnel Resources",
    "Time Management",
    "Budget Management",
    "Resource Allocation",
    "Cost Control",
    "Inventory Management"
  ],

  // Social Skills
  "Social Skills": [
    "Coordination",
    "Instructing",
    "Negotiation",
    "Persuasion",
    "Service Orientation",
    "Social Perceptiveness",
    "Emotional Intelligence",
    "Conflict Resolution",
    "Team Building",
    "Cultural Sensitivity"
  ],

  // Technical Skills - Software & Programming
  "Software Development": [
    "JavaScript",
    "Python",
    "Java",
    "C++",
    "C#",
    "TypeScript",
    "React",
    "Angular",
    "Vue.js",
    "Node.js",
    "SQL",
    "NoSQL",
    "Git",
    "Docker",
    "Kubernetes",
    "AWS",
    "Azure",
    "Google Cloud Platform",
    "Machine Learning",
    "Data Science"
  ],

  // Business & Finance
  "Business & Finance": [
    "Financial Analysis",
    "Accounting",
    "Bookkeeping",
    "Financial Reporting",
    "Budgeting",
    "Forecasting",
    "Business Analysis",
    "Market Research",
    "Strategic Planning",
    "Business Development",
    "Sales",
    "Customer Relationship Management",
    "Product Management",
    "Project Management",
    "Risk Management",
    "Compliance",
    "Audit",
    "Tax Preparation",
    "Investment Analysis",
    "Portfolio Management"
  ],

  // Marketing & Sales
  "Marketing & Sales": [
    "Digital Marketing",
    "Content Marketing",
    "Social Media Marketing",
    "SEO",
    "SEM",
    "Email Marketing",
    "Brand Management",
    "Public Relations",
    "Advertising",
    "Market Analysis",
    "Lead Generation",
    "Sales Strategy",
    "B2B Sales",
    "B2C Sales",
    "Customer Success",
    "Account Management",
    "Business Intelligence",
    "Marketing Analytics",
    "Campaign Management",
    "Event Management"
  ],

  // Healthcare & Medical
  "Healthcare": [
    "Patient Care",
    "Medical Terminology",
    "Clinical Research",
    "Healthcare Administration",
    "Medical Coding",
    "HIPAA Compliance",
    "Electronic Health Records",
    "Nursing",
    "Pharmacy",
    "Medical Diagnosis",
    "Treatment Planning",
    "Emergency Response",
    "Mental Health",
    "Public Health",
    "Health Education",
    "Medical Equipment Operation",
    "Laboratory Procedures",
    "Radiology",
    "Surgery Assistance",
    "Physical Therapy"
  ],

  // Education & Training
  "Education": [
    "Curriculum Development",
    "Lesson Planning",
    "Classroom Management",
    "Educational Technology",
    "Student Assessment",
    "Special Education",
    "Adult Education",
    "E-Learning",
    "Instructional Design",
    "Educational Psychology",
    "Academic Advising",
    "Tutoring",
    "Research Methods",
    "Grant Writing",
    "Program Development"
  ],

  // Engineering
  "Engineering": [
    "Mechanical Engineering",
    "Electrical Engineering",
    "Civil Engineering",
    "Chemical Engineering",
    "Software Engineering",
    "Systems Engineering",
    "Quality Assurance",
    "CAD/CAM",
    "AutoCAD",
    "SolidWorks",
    "MATLAB",
    "Process Improvement",
    "Six Sigma",
    "Lean Manufacturing",
    "Product Design",
    "Testing & Validation",
    "Technical Documentation",
    "Regulatory Compliance",
    "Safety Engineering",
    "Environmental Engineering"
  ],

  // Creative & Design
  "Creative & Design": [
    "Graphic Design",
    "UI/UX Design",
    "Web Design",
    "Adobe Creative Suite",
    "Photoshop",
    "Illustrator",
    "InDesign",
    "Figma",
    "Sketch",
    "Video Editing",
    "Animation",
    "3D Modeling",
    "Photography",
    "Typography",
    "Color Theory",
    "Brand Identity",
    "Visual Communication",
    "Motion Graphics",
    "User Research",
    "Wireframing"
  ],

  // Legal
  "Legal": [
    "Legal Research",
    "Contract Review",
    "Legal Writing",
    "Litigation",
    "Corporate Law",
    "Intellectual Property",
    "Employment Law",
    "Regulatory Compliance",
    "Due Diligence",
    "Legal Documentation",
    "Case Management",
    "Negotiation",
    "Mediation",
    "Patent Law",
    "Tax Law",
    "Criminal Law",
    "Family Law",
    "Real Estate Law",
    "Immigration Law",
    "International Law"
  ],

  // Human Resources
  "Human Resources": [
    "Recruiting",
    "Talent Acquisition",
    "Employee Relations",
    "Performance Management",
    "Compensation & Benefits",
    "HRIS",
    "Onboarding",
    "Training & Development",
    "Organizational Development",
    "Labor Relations",
    "Employment Law Compliance",
    "Diversity & Inclusion",
    "Succession Planning",
    "Workforce Planning",
    "Employee Engagement",
    "HR Analytics",
    "Payroll Processing",
    "Policy Development",
    "Conflict Resolution",
    "Change Management"
  ],

  // Operations & Logistics
  "Operations": [
    "Supply Chain Management",
    "Logistics",
    "Inventory Management",
    "Warehouse Management",
    "Transportation Management",
    "Procurement",
    "Vendor Management",
    "Quality Control",
    "Process Optimization",
    "ERP Systems",
    "SAP",
    "Oracle",
    "Manufacturing",
    "Distribution",
    "Demand Planning",
    "Production Planning",
    "Facilities Management",
    "Safety Management",
    "Continuous Improvement",
    "Operations Analysis"
  ],

  // Data & Analytics
  "Data & Analytics": [
    "Data Analysis",
    "Data Visualization",
    "Statistical Analysis",
    "Predictive Analytics",
    "Business Intelligence",
    "Tableau",
    "Power BI",
    "Excel",
    "R",
    "Python for Data Science",
    "SQL",
    "Big Data",
    "Hadoop",
    "Spark",
    "Data Mining",
    "Data Warehousing",
    "ETL",
    "Machine Learning",
    "Deep Learning",
    "A/B Testing"
  ],

  // Customer Service
  "Customer Service": [
    "Customer Support",
    "Client Relations",
    "Problem Resolution",
    "Technical Support",
    "Help Desk",
    "Call Center Operations",
    "Customer Satisfaction",
    "Service Excellence",
    "Complaint Handling",
    "Product Knowledge",
    "CRM Software",
    "Salesforce",
    "Zendesk",
    "Live Chat Support",
    "Email Support",
    "Phone Etiquette",
    "Ticketing Systems",
    "Service Level Agreements",
    "Customer Retention",
    "Upselling"
  ],

  // Languages
  "Languages": [
    "English",
    "Spanish",
    "Mandarin Chinese",
    "French",
    "German",
    "Japanese",
    "Portuguese",
    "Arabic",
    "Russian",
    "Italian",
    "Korean",
    "Dutch",
    "Hindi",
    "Bengali",
    "Urdu",
    "Turkish",
    "Polish",
    "Vietnamese",
    "Thai",
    "Hebrew"
  ],

  // Soft Skills
  "Soft Skills": [
    "Leadership",
    "Communication",
    "Teamwork",
    "Adaptability",
    "Problem Solving",
    "Creativity",
    "Work Ethic",
    "Interpersonal Skills",
    "Time Management",
    "Critical Thinking",
    "Decision Making",
    "Organizational Skills",
    "Stress Management",
    "Flexibility",
    "Attention to Detail",
    "Initiative",
    "Reliability",
    "Motivation",
    "Patience",
    "Empathy"
  ],

  // Industry-Specific
  "Industry Tools & Platforms": [
    "Microsoft Office",
    "Google Workspace",
    "Slack",
    "Jira",
    "Confluence",
    "Asana",
    "Trello",
    "Monday.com",
    "SharePoint",
    "Teams",
    "Zoom",
    "Salesforce",
    "HubSpot",
    "QuickBooks",
    "NetSuite",
    "Workday",
    "ServiceNow",
    "Zendesk",
    "Shopify",
    "WordPress"
  ]
};

// Flatten all skills into a single array for autocomplete
export const allSkills: string[] = Object.values(skillsData).flat().sort();

// Remove duplicates
export const uniqueSkills = [...new Set(allSkills)];

// Function to search skills with fuzzy matching
export const searchSkills = (query: string, limit: number = 20): string[] => {
  if (!query) return [];
  
  const lowerQuery = query.toLowerCase();
  
  // First, get exact matches
  const exactMatches = uniqueSkills.filter(skill => 
    skill.toLowerCase().startsWith(lowerQuery)
  );
  
  // Then, get contains matches
  const containsMatches = uniqueSkills.filter(skill => 
    !skill.toLowerCase().startsWith(lowerQuery) && 
    skill.toLowerCase().includes(lowerQuery)
  );
  
  // Combine and limit results
  return [...exactMatches, ...containsMatches].slice(0, limit);
};

// Function to get skills by category
export const getSkillsByCategory = (category: string): string[] => {
  return skillsData[category] || [];
};

// Function to get all categories
export const getCategories = (): string[] => {
  return Object.keys(skillsData);
};