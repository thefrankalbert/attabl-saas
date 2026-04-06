'use client';

import type { LucideIcon } from 'lucide-react';
import { Star } from 'lucide-react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface Testimonial {
  id: number;
  name: string;
  role: string;
  company?: string;
  content: string;
  rating: number;
  avatar: string;
}

export interface Feature {
  text: string;
}

export interface Benefit {
  text: string;
  icon: LucideIcon;
}

export interface SinglePricingCardProps {
  badge?: { icon: LucideIcon; text: string };
  title: string;
  subtitle: string;
  price: { current: string; original?: string; discount?: string };
  benefits: Benefit[];
  features: Feature[];
  featuresIcon: LucideIcon;
  featuresTitle?: string;
  primaryButton: { text: string; href?: string; onClick?: () => void };
  secondaryButton?: { text: string; href?: string; onClick?: () => void };
  testimonials: Testimonial[];
  testimonialRotationSpeed?: number;
  popular?: boolean;
  className?: string;
  maxWidth?: string;
}

export function SinglePricingCard({
  badge,
  title,
  subtitle,
  price,
  benefits,
  features,
  featuresIcon,
  featuresTitle = 'Fonctionnalites incluses',
  primaryButton,
  secondaryButton,
  testimonials,
  testimonialRotationSpeed = 5000,
  popular,
  className,
  maxWidth = 'max-w-3xl',
}: SinglePricingCardProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });
  const [currentTestimonialIndex, setCurrentTestimonialIndex] = useState(0);

  useEffect(() => {
    if (testimonials.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentTestimonialIndex((prev) => (prev + 1) % testimonials.length);
    }, testimonialRotationSpeed);
    return () => clearInterval(interval);
  }, [testimonials.length, testimonialRotationSpeed]);

  const FeaturesIcon = featuresIcon;

  return (
    <div ref={sectionRef} className={`relative ${className || ''}`}>
      <div className={`mx-auto ${maxWidth}`}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Card */}
          <div
            className={`rounded-2xl bg-white dark:bg-neutral-800 overflow-hidden ${
              popular
                ? 'ring-2 ring-neutral-900 dark:ring-white border border-transparent'
                : 'border border-neutral-200 dark:border-neutral-700'
            }`}
          >
            {/* Popular badge above */}
            {popular && (
              <div className="flex justify-center -mt-px">
                <span className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[10px] px-3 py-1 rounded-b-lg font-semibold uppercase tracking-wider">
                  Le plus populaire
                </span>
              </div>
            )}

            <div className="flex flex-col md:flex-row">
              {/* Left - Pricing */}
              <div className="p-6 sm:p-8 md:w-1/2 flex flex-col">
                {badge && (
                  <div className="flex items-center mb-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 dark:bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                      <badge.icon className="h-3.5 w-3.5" />
                      {badge.text}
                    </span>
                  </div>
                )}

                <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
                  {title}
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-5">{subtitle}</p>

                <div className="mb-6">
                  <span className="text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white tabular-nums">
                    {price.current}
                  </span>
                  <div className="h-5 mt-1">
                    {price.original && (
                      <span className="text-sm text-neutral-400 line-through">
                        {price.original}
                      </span>
                    )}
                    {price.discount && (
                      <span className="ml-2 text-xs font-semibold text-green-600">
                        {price.discount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  {benefits.map((benefit, index) => {
                    const BenefitIcon = benefit.icon;
                    return (
                      <div key={index} className="flex items-center gap-2.5">
                        <BenefitIcon className="h-4 w-4 text-neutral-700 dark:text-neutral-300 shrink-0" />
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">
                          {benefit.text}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto space-y-3">
                  {primaryButton.href ? (
                    <Link
                      href={primaryButton.href}
                      className={`block w-full text-center rounded-lg py-3 text-sm font-semibold transition-colors ${
                        popular
                          ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100'
                          : 'bg-neutral-900 text-white hover:bg-neutral-800'
                      }`}
                    >
                      {primaryButton.text}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={primaryButton.onClick}
                      className="block w-full text-center rounded-lg py-3 text-sm font-semibold bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      {primaryButton.text}
                    </button>
                  )}

                  {secondaryButton &&
                    (secondaryButton.href ? (
                      <Link
                        href={secondaryButton.href}
                        className="block w-full text-center rounded-lg border border-neutral-300 dark:border-neutral-600 py-3 text-sm font-semibold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700"
                      >
                        {secondaryButton.text}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={secondaryButton.onClick}
                        className="block w-full text-center rounded-lg border border-neutral-300 dark:border-neutral-600 py-3 text-sm font-semibold text-neutral-900 dark:text-white transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer"
                      >
                        {secondaryButton.text}
                      </button>
                    ))}
                </div>
              </div>

              {/* Right - Features */}
              <div className="p-6 sm:p-8 md:w-1/2 md:border-l border-t md:border-t-0 border-neutral-200 dark:border-neutral-700">
                <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">
                  {featuresTitle}
                </h4>

                <div className="space-y-3 mb-6">
                  {features.map((feature, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.4 + i * 0.05, duration: 0.5 }}
                      className="flex items-center gap-3"
                    >
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-700 shrink-0">
                        <FeaturesIcon className="h-3 w-3 text-green-600" />
                      </div>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {feature.text}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {testimonials.length > 0 && (
                  <>
                    <div className="h-px w-full bg-neutral-200 dark:bg-neutral-700 my-6" />

                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 relative overflow-hidden min-h-[140px]">
                      <AnimatePresence mode="wait">
                        {testimonials.map(
                          (testimonial, index) =>
                            index === currentTestimonialIndex && (
                              <motion.div
                                key={testimonial.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.5 }}
                                className="absolute inset-0 p-4"
                              >
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="h-8 w-8 rounded-full overflow-hidden">
                                    <Image
                                      src={testimonial.avatar}
                                      alt={testimonial.name}
                                      width={32}
                                      height={32}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm text-neutral-900 dark:text-white">
                                      {testimonial.name}
                                    </p>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                      {testimonial.role}
                                      {testimonial.company && ` - ${testimonial.company}`}
                                    </p>
                                  </div>
                                  <div className="ml-auto flex">
                                    {[...Array(testimonial.rating)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className="h-3 w-3 fill-amber-400 text-amber-400"
                                      />
                                    ))}
                                  </div>
                                </div>
                                <p className="text-sm italic text-neutral-600 dark:text-neutral-300">
                                  {testimonial.content}
                                </p>
                              </motion.div>
                            ),
                        )}
                      </AnimatePresence>
                    </div>

                    {testimonials.length > 1 && (
                      <div className="flex justify-center mt-4 gap-1">
                        {testimonials.map((_, index) => (
                          <button
                            key={index}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              index === currentTestimonialIndex
                                ? 'w-4 bg-neutral-900 dark:bg-white'
                                : 'w-1.5 bg-neutral-300 dark:bg-neutral-600'
                            }`}
                            onClick={() => setCurrentTestimonialIndex(index)}
                            aria-label={`Temoignage ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
