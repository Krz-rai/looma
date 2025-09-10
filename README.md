# Looma - AI-Powered Resume Builder

Looma is an intelligent resume builder that helps you create professional resumes with AI assistance. Built with modern web technologies for a seamless user experience.

## Features

- 🤖 **AI-Powered Chat**: Get personalized advice and suggestions for your resume
- 📝 **Smart Resume Builder**: Create and edit resumes with drag-and-drop functionality
- 🎯 **Project Management**: Organize your projects and achievements with bullet points
- 📄 **PDF Export**: Download your resume as a professional PDF
- 🔒 **Secure Authentication**: User accounts with Clerk integration
- ⚡ **Real-time Updates**: Live collaboration and instant updates

## Tech Stack

- **Backend**: [Convex](https://convex.dev/) - Real-time database and server logic
- **Frontend**: [React](https://react.dev/) + [Next.js](https://nextjs.org/) - Modern web framework
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- **Authentication**: [Clerk](https://clerk.com/) - User management and authentication
- **AI Integration**: OpenAI GPT models for intelligent resume assistance

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Convex account
- Clerk account (for authentication)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd looma
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure Convex:
```bash
npx convex dev
```

5. Set up Clerk authentication:
   - Create a Clerk application
   - Follow the [Convex Clerk onboarding guide](https://docs.convex.dev/auth/clerk#get-started)
   - Configure JWT template in Convex
   - Add Clerk environment variables

6. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Project Structure

```
looma/
├── app/                    # Next.js app directory
│   ├── components/         # React components
│   ├── resumes/           # Resume-related pages
│   └── globals.css        # Global styles
├── components/            # Shared components
│   └── ui/               # UI component library
├── convex/               # Convex backend
│   ├── schema.ts         # Database schema
│   ├── ai.ts            # AI integration
│   └── resumes.ts       # Resume operations
└── lib/                  # Utility functions
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is private and proprietary.
