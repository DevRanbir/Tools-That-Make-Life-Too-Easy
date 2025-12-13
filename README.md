# Tools That Make Life Too Easy - AI Tools Directory

A modern, interactive directory for AI tools and products, featuring a dynamic masonry grid layout, realtime updates, and a sleek user interface. Built with React, Vite, and Supabase.

## ✨ Features

- **🎨 Masonry Grid Layout**: Responsive, gap-free grid layout using CSS columns and Framer Motion for smooth transitions.
- **⚡ Realtime Updates**: Live updates for new products, deletions, and view counts using Supabase Realtime subscriptions.
- **🔍 Interactive UI**:
  - **Morphing Dialogs**: Smooth expansion of cards into detailed views.
  - **Magnetic Navigation**: Interactive navigation bar with physics-based hover effects.
  - **Progressive Blur**: Advanced visual effects for text overlays.
- **🛠️ Admin Dashboard**: Dedicated `/manage` page to add and remove products.
  - Image Uploads (Supabase Storage)
  - Tag Management
  - **Flexible Pricing Models**: Support for Free, Paid (Currency), and Credit-based pricing.
- **☁️ Supabase Backend**: robust PostgreSQL database, Storage for assets, and Realtime capabilities.

## 🛠️ Tech Stack

- **Frontend Framework**: [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: 
  - [Framer Motion](https://www.framer.com/motion/) (Layout animations, Dialogs)
  - [GSAP](https://gsap.com/) (Scroll triggers, complex interactions)
- **Backend**: [Supabase](https://supabase.com/)
  - Database (PostgreSQL)
  - Storage (Image hosting)
  - Realtime (Live updates)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A [Supabase](https://supabase.com/) account

### Installation

1.  **Clone the repository**
    ```bash
    git clone <repository-url>
    cd tools-that-make-life-too-easy
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory and add your Supabase credentials:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Database Setup**
    Run the SQL commands found in `supabase_setup.sql` in your Supabase project's SQL Editor to create the necessary tables and policies.
    
    *Note: You will also need to create a public storage bucket named `products` in your Supabase dashboard.*

5.  **Run the development server**
    ```bash
    npm run dev
    ```

## 📂 Project Structure

```
src/
├── assets/             # Static assets
├── components/         # Reusable UI components
│   ├── Masonry.jsx     # Main grid layout logic
│   ├── MasonryCard.jsx # Individual product card
│   ├── morphing-dialog.jsx # Dialog animation component
│   └── ...
├── pages/              # Route pages
│   ├── Home.jsx        # Main landing page
│   ├── Manage.jsx      # Admin interface
│   └── ...
├── lib/                # Utilities (cn, etc.)
├── hooks/              # Custom React hooks
├── supabase.js         # Supabase client configuration
├── App.jsx             # Main application entry
└── main.jsx            # DOM rendering
```

## 📄 License

MIT
