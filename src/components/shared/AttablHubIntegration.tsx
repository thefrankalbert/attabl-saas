"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useAnimationFrame } from "framer-motion";
import {
    Layout,
    CreditCard,
    ChefHat,
    Building,
    Users,
    Package,
    BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Types
interface SatelliteNode {
    id: string;
    label: string;
    labelEn: string;
    icon: React.ElementType;
    angle: number; // Position angle in degrees
    distance: number; // Distance factor (0-1) relative to radius
}

const SATELLITES: SatelliteNode[] = [
    { id: "payments", label: "Paiements", labelEn: "Payments", icon: CreditCard, angle: 0, distance: 1 },
    { id: "kitchen", label: "Cuisine", labelEn: "Kitchen", icon: ChefHat, angle: 60, distance: 0.9 },
    { id: "pms", label: "PMS Hôtelier", labelEn: "Hotel PMS", icon: Building, angle: 120, distance: 1 },
    { id: "clients", label: "Clients", labelEn: "Clients", icon: Users, angle: 180, distance: 0.9 },
    { id: "stock", label: "Stock", labelEn: "Stock", icon: Package, angle: 240, distance: 1 },
    { id: "stats", label: "Statistiques", labelEn: "Statistics", icon: BarChart2, angle: 300, distance: 0.9 },
];

// Animated beam component
function AnimatedBeam({
    pathD,
    delay = 0,
    duration = 3,
    reverse = false,
}: {
    pathD: string;
    delay?: number;
    duration?: number;
    reverse?: boolean;
}) {
    const pathRef = useRef<SVGPathElement>(null);
    const [pathLength, setPathLength] = useState(0);
    const [dashOffset, setDashOffset] = useState(0);
    const startTime = useRef(Date.now() + delay * 1000);

    useEffect(() => {
        if (pathRef.current) {
            setPathLength(pathRef.current.getTotalLength());
        }
    }, [pathD]);

    useAnimationFrame(() => {
        if (pathLength === 0) return;

        const elapsed = (Date.now() - startTime.current) / 1000;
        if (elapsed < 0) return;

        // Smooth infinite loop
        const progress = (elapsed % duration) / duration;

        // easing for more organic feel
        const ease = (t: number) => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const easedProgress = ease(progress);

        const offset = reverse
            ? pathLength * (1 - easedProgress) - pathLength
            : -pathLength * easedProgress;

        setDashOffset(offset);
    });

    // Beam is shorter and sharper for a "pulse" feel
    const beamLength = pathLength * 0.15;

    return (
        <g>
            {/* Base line - extremely subtle */}
            <path
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-gray-200/50 dark:text-gray-800/50"
            />
            {/* Animated beam - neon green with glow */}
            <path
                ref={pathRef}
                d={pathD}
                fill="none"
                stroke="#CCFF00"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeDasharray={`${beamLength} ${pathLength}`}
                strokeDashoffset={dashOffset}
                className="opacity-80"
            />
            {/* Duplicate beam for glow effect (simulated via wider stroke + opacity) */}
            <path
                d={pathD}
                fill="none"
                stroke="#CCFF00"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${beamLength} ${pathLength}`}
                strokeDashoffset={dashOffset}
                className="opacity-20 blur-[2px]"
            />
        </g>
    );
}

// Generate curved path from center to satellite
function generateCurvedPath(
    centerX: number,
    centerY: number,
    targetX: number,
    targetY: number
): string {
    const midX = (centerX + targetX) / 2;
    const midY = (centerY + targetY) / 2;

    // Add curve offset perpendicular to the line
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Variable curvature based on distance - gives organic feel
    const curveOffset = length * 0.2;

    // Perpendicular direction
    const perpX = -dy / length;
    const perpY = dx / length;

    const controlX = midX + perpX * curveOffset;
    const controlY = midY + perpY * curveOffset;

    return `M ${centerX} ${centerY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;
}

interface AttablHubIntegrationProps {
    lang?: "fr" | "en";
}

export default function AttablHubIntegration({
    lang = "fr",
}: AttablHubIntegrationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const width = containerRef.current.offsetWidth;
                const mobile = width < 768; // Md breakpoint
                setIsMobile(mobile);
                setDimensions({
                    width,
                    height: mobile ? SATELLITES.length * 90 + 200 : Math.min(width * 0.6, 600),
                });
            }
        };

        updateDimensions();
        window.addEventListener("resize", updateDimensions);
        return () => window.removeEventListener("resize", updateDimensions);
    }, []);

    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = isMobile ? 80 : height / 2;
    // Responsive radius
    const radius = isMobile ? 0 : Math.min(width, height) * 0.38;

    // Calculate satellite positions
    const satellitePositions = SATELLITES.map((sat, index) => {
        if (isMobile) {
            return {
                x: centerX,
                y: 180 + index * 90,
            };
        }
        const angleRad = (sat.angle - 90) * (Math.PI / 180);
        // Apply slight distance variation for organic feel
        const dist = radius * sat.distance;
        return {
            x: centerX + dist * Math.cos(angleRad),
            y: centerY + dist * Math.sin(angleRad),
        };
    });

    return (
        <section className="py-20 md:py-32 bg-transparent relative overflow-hidden">
            {/* Background ambient glow - huge and subtle */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#CCFF00]/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="container mx-auto px-6 max-w-7xl relative z-10">
                {/* Hub Visualization */}
                <div
                    ref={containerRef}
                    className="relative w-full max-w-4xl mx-auto"
                    style={{ height: height || 600 }}
                >
                    {width > 0 && (
                        <>
                            {/* SVG Layer for beams */}
                            <svg
                                className="absolute inset-0 w-full h-full pointer-events-none z-0"
                                viewBox={`0 0 ${width} ${height}`}
                            >
                                {satellitePositions.map((pos, index) => (
                                    <AnimatedBeam
                                        key={SATELLITES[index].id}
                                        pathD={generateCurvedPath(centerX, centerY, pos.x, pos.y)}
                                        delay={index * 0.3}
                                        duration={3}
                                        reverse={index % 2 === 1}
                                    />
                                ))}
                            </svg>

                            {/* Central Node */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                whileInView={{ scale: 1, opacity: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                                className="absolute z-20"
                                style={{
                                    left: centerX,
                                    top: centerY,
                                    transform: "translate(-50%, -50%)",
                                }}
                            >
                                {/* Layered Glows for "Neon Diffuse" effect */}
                                <div className="absolute inset-0 bg-[#CCFF00] rounded-full blur-[60px] opacity-20 animate-pulse-slow" />
                                <div className="absolute inset-0 bg-[#CCFF00] rounded-full blur-[30px] opacity-30" />

                                {/* Main Circle */}
                                <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full bg-white dark:bg-black border border-gray-100 dark:border-white/10 flex items-center justify-center z-10">
                                    {/* Inner ring for extra detail */}
                                    <div className="absolute inset-2 rounded-full border border-gray-100 dark:border-white/5" />

                                    <div className="relative bg-black dark:bg-[#CCFF00] text-[#CCFF00] dark:text-black rounded-2xl p-3 md:p-4">
                                        <Layout className="h-8 w-8 md:h-10 md:w-10" />
                                    </div>
                                </div>
                            </motion.div>

                            {/* Satellite Nodes */}
                            {satellitePositions.map((pos, index) => {
                                const satellite = SATELLITES[index];
                                const Icon = satellite.icon;

                                return (
                                    <motion.div
                                        key={satellite.id}
                                        initial={{ scale: 0, opacity: 0 }}
                                        whileInView={{ scale: 1, opacity: 1 }}
                                        viewport={{ once: true }}
                                        // Floating animation - organic bobbing
                                        animate={{
                                            y: isMobile ? 0 : [0, -10, 0],
                                        }}
                                        transition={{
                                            // Float animation
                                            y: {
                                                duration: 3 + index, // Varied duration
                                                repeat: Infinity,
                                                ease: "easeInOut",
                                                delay: index * 0.2
                                            },
                                            // Entrance animation
                                            scale: { duration: 0.5, delay: 0.2 + index * 0.1 },
                                            opacity: { duration: 0.5, delay: 0.2 + index * 0.1 }
                                        }}
                                        className="absolute z-10 flex flex-col items-center justify-center p-4"
                                        style={{
                                            left: pos.x,
                                            top: pos.y,
                                            transform: "translate(-50%, -50%)",
                                        }}
                                    >
                                        {/* Node Circle */}
                                        <div className="relative group cursor-default">
                                            {/* Hover Glow */}
                                            <div className="absolute inset-0 bg-[#CCFF00] rounded-full blur-xl opacity-0 group-hover:opacity-20 transition-opacity duration-500" />

                                            <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 flex items-center justify-center transition-all duration-300 group-hover:border-[#CCFF00]/50 group-hover:scale-105">
                                                <Icon className="h-6 w-6 md:h-8 md:w-8 text-gray-500 dark:text-gray-400 group-hover:text-[#CCFF00] transition-colors duration-300" strokeWidth={1.5} />
                                            </div>
                                        </div>

                                        {/* Label - Clean Typography */}
                                        <span className="mt-3 text-xs md:text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap bg-white/80 dark:bg-black/80 px-3 py-1 rounded-full border border-transparent dark:border-white/5 backdrop-blur-sm">
                                            {lang === "fr" ? satellite.label : satellite.labelEn}
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}
