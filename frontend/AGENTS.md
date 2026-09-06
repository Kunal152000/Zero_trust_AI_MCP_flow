### Next.js Frontend Development Instructions

### Tech Stack & Core Standards

* **Framework:** Next.js (App Router, React 19 server/client model).
* **Styling:** Tailwind CSS (Strictly utility classes, no custom inline style blocks).
* **Architecture:** Strictly feature-based, component-isolated approach.

### Feature-Based Component Structure

Each major domain feature must live inside its own directory within src/app/features/[feature-name]/. Never put feature-specific UI elements into the global shared components directory.

* **File Isolation:** A feature folder must house its layout, local parts, and API logic together: 

src/features/user-profile/
├── components/          # Local components used ONLY by this feature
│   ├── ProfileAvatar.tsx
│   └── ProfileForm.tsx
├── actions.ts           # Feature-specific Server Actions
└── index.ts             # Clean public API for the feature

Use code with caution.
* **Global Components:** Only truly generic layout blocks (e.g., Button.tsx, Modal.tsx) belong in src/components/.

### Local Development Commands

* **Start Dev Server:** npm run dev (Default Next.js environment)
* **Build Application:** npm run build
* **Run Linter:** npm run lint

### Strict Boundaries

* **No Hidden Bloat:** Do not generate complex state machines or abstract context wrappers unless explicitly asked.
* **Zero Package Sprawl:** Never download or modify package.json to add UI/utility components. Use native solutions first.
* **Arbitrary Breakpoints:** Do not hardcode custom spacing, media queries, or hex colors. Use the default Tailwind configuration tokens exclusively.
