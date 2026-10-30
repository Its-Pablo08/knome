import React from "react";
import { motion } from "framer-motion";

export function FloatingPaths({ position = 1 }) {
    const paths = Array.from({ length: 36 }, (_, i) => ({
        id: i,
        d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position
            } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position
            } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position
            } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
        color: `rgba(99,102,241,${0.1 + i * 0.03})`,
        width: 0.5 + i * 0.03,
    }));

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <svg
                className="w-full h-full text-indigo-500/30 dark:text-indigo-400/20"
                viewBox="0 0 696 316"
                fill="none"
            >
                <title>Background Paths</title>
                {paths.map((path) => (
                    <motion.path
                        key={path.id}
                        d={path.d}
                        stroke="currentColor"
                        strokeWidth={path.width}
                        strokeOpacity={0.15 + path.id * 0.02}
                        initial={{ pathLength: 0.3, opacity: 0.6 }}
                        animate={{
                            pathLength: 1,
                            opacity: [0.3, 0.7, 0.3],
                            pathOffset: [0, 1, 0],
                        }}
                        transition={{
                            duration: 20 + (path.id % 10),
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "linear",
                        }}
                    />
                ))}
            </svg>
        </div>
    );
}

export function BackgroundPaths({
    title = "TechnoSocial Knowledge Hub",
    subtitle = "Explore articles, discussions & community updates",
    buttonText = "Discover Excellence",
    onButtonClick,
}) {
    const words = title.split(" ");

    return (
        <div className="relative w-full py-12 px-6 rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/20 shadow-2xl mb-8">
            <div className="absolute inset-0 opacity-80">
                <FloatingPaths position={1} />
                <FloatingPaths position={-1} />
            </div>

            <div className="relative z-10 container mx-auto text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="max-w-3xl mx-auto"
                >
                    <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-4 tracking-tight leading-tight">
                        {words.map((word, wordIndex) => (
                            <span
                                key={wordIndex}
                                className="inline-block mr-3 last:mr-0"
                            >
                                {word.split("").map((letter, letterIndex) => (
                                    <motion.span
                                        key={`${wordIndex}-${letterIndex}`}
                                        initial={{ y: 60, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{
                                            delay:
                                                wordIndex * 0.08 +
                                                letterIndex * 0.02,
                                            type: "spring",
                                            stiffness: 150,
                                            damping: 25,
                                        }}
                                        className="inline-block text-transparent bg-clip-text 
                                        bg-gradient-to-r from-white via-indigo-100 to-purple-200"
                                    >
                                        {letter}
                                    </motion.span>
                                ))}
                            </span>
                        ))}
                    </h1>

                    {subtitle && (
                        <p className="text-indigo-200/90 text-sm sm:text-base md:text-lg mb-8 font-medium max-w-xl mx-auto">
                            {subtitle}
                        </p>
                    )}

                    <div
                        className="inline-block group relative bg-gradient-to-b from-indigo-500/20 to-purple-500/20 
                        p-px rounded-2xl backdrop-blur-lg overflow-hidden shadow-lg hover:shadow-indigo-500/20 transition-all duration-300"
                    >
                        <button
                            onClick={onButtonClick}
                            className="rounded-[1.15rem] px-6 py-3.5 text-sm sm:text-base font-bold backdrop-blur-md 
                            bg-white/90 hover:bg-white text-indigo-950 transition-all duration-300 
                            group-hover:-translate-y-0.5 border border-white/20 flex items-center gap-2 cursor-pointer"
                        >
                            <span className="opacity-90 group-hover:opacity-100 transition-opacity">
                                {buttonText}
                            </span>
                            <span
                                className="opacity-70 group-hover:opacity-100 group-hover:translate-x-1 
                                transition-all duration-300"
                            >
                                →
                            </span>
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
