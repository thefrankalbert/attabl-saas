"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Send } from "lucide-react";
import Image from "next/image";

interface NewsletterSectionProps {
    primaryColor?: string;
    logoUrl?: string;
}

export default function NewsletterSection({
    primaryColor = "#eab308", // default to yellow-500/gold if not provided
    logoUrl
}: NewsletterSectionProps) {
    return (
        <section className="w-full bg-[#0a0a0a] py-16 px-4 md:px-8 border-t border-gray-800">
            <div className="container mx-auto max-w-6xl">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
                    {/* Left side: Text */}
                    <div className="w-full lg:w-1/2 space-y-6">
                        <div className="flex items-center gap-3">
                            {logoUrl ? (
                                <div className="h-10 w-10 relative bg-white/10 rounded-lg p-1 overflow-hidden">
                                    <Image
                                        src={logoUrl}
                                        alt="Logo"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                            ) : (
                                <div
                                    className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-lg"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <span>A</span>
                                </div>
                            )}
                        </div>
                        <h2 className="text-4xl md:text-5xl font-serif text-white leading-[1.1]">
                            Stay updated with <br />
                            <span className="italic font-light text-gray-300">new insights</span>
                        </h2>
                        <p className="text-gray-400 text-sm md:text-base max-w-md leading-relaxed">
                            Get product updates, best practices, and smart growth tips straight to your inbox.
                        </p>
                    </div>

                    {/* Right side: Form */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-4 relative">
                        <div className="hidden lg:block absolute -left-16 top-1/2 -translate-y-1/2 text-gray-600">
                            <ArrowRight className="w-12 h-6" />
                        </div>

                        {/* Input group */}
                        <div className="flex w-full items-center p-1.5 rounded-xl bg-white/5 border border-white/10 focus-within:border-white/20 transition-all shadow-inner">
                            <Input
                                type="email"
                                placeholder="Your email"
                                className="bg-transparent border-none text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 h-10 md:h-12 flex-grow"
                            />
                            <Button
                                className="h-10 md:h-12 px-6 md:px-8 rounded-lg font-medium text-white transition-transform hover:scale-105 active:scale-95 shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                Send
                            </Button>
                        </div>
                        <p className="text-xs text-gray-600 pl-2">
                            Don&apos;t worry, we&apos;re not spamming.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
