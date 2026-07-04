'use client';

import React from 'react';

// --- Step Error Boundary ------------------------------------------------------

// The fallback is required and provided (translated) by the parent, because a class
// component cannot call the useTranslations hook to localize its own error message.
export class StepErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
