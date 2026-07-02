'use client';

import React from 'react';

// ─── Step Error Boundary ──────────────────────────────────────────────────────

export class StepErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-8 text-center">
            <p className="text-red-500">Une erreur est survenue. Rechargez la page.</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
