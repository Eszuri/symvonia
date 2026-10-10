"use client";

import {getAccent} from "../lib/colors";

interface SkeletonProps {
    accentColor?: string;
    className?: string;
    variant?: "text" | "rect" | "circle" | "button" | "cover";
    width?: string;
    height?: string;
    animate?: boolean;
}

function Skeleton({
    accentColor = "violet",
    className = "",
    variant = "rect",
    width,
    height,
    animate = true,
}: SkeletonProps) {
    const accent = getAccent(accentColor);

    const variantClasses: Record<string, string> = {
        text: "h-3 rounded",
        rect: "rounded",
        circle: "rounded-full",
        button: "h-9 rounded-lg",
        cover: "aspect-square rounded-2xl",
    };

    const style: React.CSSProperties = {};
    if (width) style.width = width;
    if (height) style.height = height;

    return (
        <div
            className={`relative overflow-hidden bg-zinc-800/70 ${variantClasses[variant]} ${className}`}
            style={style}
        >
            {animate && (
                <span
                    suppressHydrationWarning
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: `linear-gradient(0deg, transparent, ${accent.hex400}33, transparent)`,
                        animation: "skeleton-shimmer 1.5s ease-in-out infinite",
                    }}
                />
            )}
        </div>
    );
}

const SKELETON_INIT_TITLE_WIDTHS = [
    "w-[74%]",
    "w-[58%]",
    "w-[84%]",
    "w-[66%]",
    "w-[80%]",
    "w-[54%]",
    "w-[72%]",
    "w-[62%]",
];

const SKELETON_INIT_ARTIST_WIDTHS = [
    "w-[68%]",
    "w-[50%]",
    "w-[78%]",
    "w-[58%]",
    "w-[72%]",
    "w-[46%]",
];

function FolderExplorerSkeleton({
    accentColor = "violet",
}: {
    accentColor?: string;
}) {
    const accent = getAccent(accentColor);

    return (
        <div className="flex flex-col w-full h-full select-none pointer-events-none">
            {/* Mock Column Headers */}
            <div className="flex items-center px-3 py-1.5 bg-zinc-900 border-b border-zinc-800/60 gap-1 shrink-0">
                <div style={{ width: 170, minWidth: 170 }} className="shrink-0 flex items-center">
                    <div className="relative overflow-hidden h-2.5 w-12 rounded-xs bg-zinc-800/60">
                        <span
                            suppressHydrationWarning
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${accent.hex400}20, transparent)`,
                                animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                            }}
                        />
                    </div>
                </div>
                <div style={{ width: 100, minWidth: 100 }} className="shrink-0 flex items-center px-1">
                    <div className="relative overflow-hidden h-2.5 w-10 rounded-xs bg-zinc-800/60">
                        <span
                            suppressHydrationWarning
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${accent.hex400}20, transparent)`,
                                animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                animationDelay: "0.1s",
                            }}
                        />
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-end px-1">
                    <div className="relative overflow-hidden h-2.5 w-8 rounded-xs bg-zinc-800/60">
                        <span
                            suppressHydrationWarning
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: `linear-gradient(90deg, transparent, ${accent.hex400}20, transparent)`,
                                animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                animationDelay: "0.2s",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Mock Song Rows */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {Array.from({ length: 12 }).map((_, i) => {
                    const delay = (i % 6) * 0.12;
                    return (
                        <div
                            key={i}
                            className="w-full flex items-center px-3 border-b border-zinc-900/40 gap-1 border-l-2 border-transparent"
                            style={{ height: 36 }}
                        >
                            {/* Name col */}
                            <div style={{ width: 170, minWidth: 170 }} className="shrink-0 flex items-center gap-2 pr-1 overflow-hidden">
                                <div className="shrink-0 w-3.5 h-3.5 rounded-sm bg-zinc-800/80 relative overflow-hidden">
                                    <span
                                        suppressHydrationWarning
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            background: `linear-gradient(90deg, transparent, ${accent.hex400}28, transparent)`,
                                            animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                            animationDelay: `${delay}s`,
                                        }}
                                    />
                                </div>
                                <div
                                    className={`relative overflow-hidden h-3 rounded-xs bg-zinc-800/70 ${
                                        SKELETON_INIT_TITLE_WIDTHS[i % SKELETON_INIT_TITLE_WIDTHS.length]
                                    }`}
                                >
                                    <span
                                        suppressHydrationWarning
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            background: `linear-gradient(90deg, transparent, ${accent.hex400}28, transparent)`,
                                            animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                            animationDelay: `${delay + 0.04}s`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Artist col */}
                            <div style={{ width: 100, minWidth: 100 }} className="shrink-0 flex items-center px-1 overflow-hidden">
                                <div
                                    className={`relative overflow-hidden h-2.5 rounded-xs bg-zinc-800/60 ${
                                        SKELETON_INIT_ARTIST_WIDTHS[i % SKELETON_INIT_ARTIST_WIDTHS.length]
                                    }`}
                                >
                                    <span
                                        suppressHydrationWarning
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            background: `linear-gradient(90deg, transparent, ${accent.hex400}22, transparent)`,
                                            animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                            animationDelay: `${delay + 0.08}s`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Duration col */}
                            <div className="flex-1 flex items-center justify-end px-1 overflow-hidden">
                                <div className="relative overflow-hidden h-2.5 w-8 rounded-xs bg-zinc-800/60 mr-0.5">
                                    <span
                                        suppressHydrationWarning
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                            background: `linear-gradient(90deg, transparent, ${accent.hex400}22, transparent)`,
                                            animation: "skeleton-shimmer-h 1.8s ease-in-out infinite",
                                            animationDelay: `${delay + 0.16}s`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PlayerPanelSkeleton({
    accentColor = "violet",
    hideCover = false,
}: {
    accentColor?: string;
    hideCover?: boolean;
}) {
    return (
        <div className="w-full flex flex-col items-center gap-2 sm:gap-3.5">
            {!hideCover && (
                <Skeleton
                    accentColor={accentColor}
                    variant="cover"
                    className="w-full max-w-90 sm:max-w-105 md:max-w-115 max-h-[45vh] ring-1 ring-white/5"
                />
            )}
            <div className="text-center w-full px-3 sm:px-4 space-y-2">
                <Skeleton accentColor={accentColor} variant="text" className="h-6 w-3/4 mx-auto" />
                <Skeleton accentColor={accentColor} variant="text" className="h-4 w-1/2 mx-auto" />
                <Skeleton accentColor={accentColor} variant="text" className="h-3 w-2/3 mx-auto" />
            </div>
        </div>
    );
}

function SeekBarSkeleton({accentColor = "violet"}: {accentColor?: string}) {
    return (
        <div className="w-full">
            <div className="relative w-full h-5 flex items-center">
                <Skeleton accentColor={accentColor} className="absolute inset-x-0 h-1.5 rounded-full" />
            </div>
            <div className="flex justify-between mt-1.5">
                <Skeleton accentColor={accentColor} variant="text" className="w-10 h-3" />
                <Skeleton accentColor={accentColor} variant="text" className="w-10 h-3" />
            </div>
        </div>
    );
}

function PlaybackControlsSkeleton({accentColor = "violet"}: {accentColor?: string}) {
    return (
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
            <Skeleton accentColor={accentColor} variant="button" className="w-9" />
            <Skeleton accentColor={accentColor} variant="circle" className="w-10 h-10" />
            <Skeleton accentColor={accentColor} variant="circle" className="w-12 h-12 sm:w-14 sm:h-14" />
            <Skeleton accentColor={accentColor} variant="circle" className="w-10 h-10" />
            <Skeleton accentColor={accentColor} variant="button" className="w-9" />
        </div>
    );
}

function VolumeControlSkeleton({accentColor = "violet"}: {accentColor?: string}) {
    return (
        <div className="flex items-center gap-2 w-full justify-center">
            <Skeleton accentColor={accentColor} variant="circle" className="w-7 h-7 shrink-0" />
            <Skeleton accentColor={accentColor} variant="button" className="w-5 h-5" />
            <Skeleton accentColor={accentColor} className="flex-1 min-w-14 max-w-40 h-1 rounded-full" />
            <Skeleton accentColor={accentColor} variant="button" className="w-5 h-5" />
            <Skeleton accentColor={accentColor} variant="text" className="w-9 h-3" />
        </div>
    );
}

function MetadataPanelSkeleton({accentColor = "violet"}: {accentColor?: string}) {
    return (
        <div className="space-y-4">
            <Skeleton accentColor={accentColor} variant="cover" className="w-full max-w-40 mx-auto ring-1 ring-white/5" />

            <div className="space-y-3">
                <Skeleton accentColor={accentColor} variant="text" className="h-3 w-20" />
                <div className="space-y-3 pl-1">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="space-y-1">
                            <Skeleton accentColor={accentColor} variant="text" className="h-2 w-16" />
                            <Skeleton accentColor={accentColor} variant="text" className="h-3 w-32" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <Skeleton accentColor={accentColor} variant="text" className="h-3 w-24" />
                <div className="space-y-3 pl-1">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-1">
                            <Skeleton accentColor={accentColor} variant="text" className="h-2 w-20" />
                            <Skeleton accentColor={accentColor} variant="text" className="h-3 w-24" />
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <Skeleton accentColor={accentColor} variant="text" className="h-3 w-20" />
                <div className="space-y-3 pl-1">
                    {[1, 2].map((i) => (
                        <div key={i} className="space-y-1">
                            <Skeleton accentColor={accentColor} variant="text" className="h-2 w-16" />
                            <Skeleton accentColor={accentColor} variant="text" className="h-3 w-40" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function HeaderSkeleton({accentColor}: {accentColor: string}) {
    return (
        <header className="flex items-center px-3 sm:px-5 py-2.5 sm:py-3 border-b border-zinc-800/50 bg-zinc-950/80">
            <div className="flex items-center gap-1.5 shrink-0">
                <Skeleton accentColor={accentColor} variant="button" className="w-18 h-7 rounded-lg" />
                <Skeleton accentColor={accentColor} variant="button" className="w-18 h-7 rounded-lg" />
            </div>
            <div className="flex-1" />
            <Skeleton accentColor={accentColor} variant="button" className="w-17 h-5 rounded-full shrink-0" />
        </header>
    );
}

function StatusBarSkeleton({accentColor}: {accentColor: string}) {
    return (
        <div className="w-full h-6 bg-zinc-950/85 border-t border-white/5 px-3 flex items-center justify-between shrink-0">
            <Skeleton accentColor={accentColor} variant="text" className="w-40 h-2.5" />
            <div className="flex items-center gap-3">
                <Skeleton accentColor={accentColor} variant="text" className="w-12 h-2.5" />
                <span className="h-2.5 w-px bg-zinc-800" />
                <Skeleton accentColor={accentColor} variant="text" className="w-16 h-2.5" />
            </div>
        </div>
    );
}

function InitSkeleton({accentColor = "sky"}: {accentColor?: string}) {
    return (
        <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Folder Explorer */}
            <div
                suppressHydrationWarning
                style={{ width: 360 }}
                className="shrink-0 border-r border-zinc-800/50 bg-black/30 flex flex-col max-lg:hidden overflow-hidden"
            >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800/30">
                    <Skeleton accentColor={accentColor} variant="button" className="w-7 h-7" />
                    <Skeleton accentColor={accentColor} variant="text" className="flex-1 h-3" />
                    <Skeleton accentColor={accentColor} variant="button" className="w-7 h-7" />
                </div>
                <div className="flex-1 overflow-hidden">
                    <FolderExplorerSkeleton accentColor={accentColor} />
                </div>
            </div>

            {/* Center Panel: Player & Controls */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden">
                <div className="w-full max-w-2xl space-y-6">
                    <PlayerPanelSkeleton accentColor={accentColor} />
                    <SeekBarSkeleton accentColor={accentColor} />
                    <div className="flex justify-center">
                        <PlaybackControlsSkeleton accentColor={accentColor} />
                    </div>
                    <div className="flex justify-center mt-2">
                        <VolumeControlSkeleton accentColor={accentColor} />
                    </div>
                </div>
            </div>

            {/* Right Panel: Metadata & Lyrics */}
            <div
                suppressHydrationWarning
                style={{ width: 360 }}
                className="shrink-0 border-l border-zinc-800/50 bg-zinc-950/40 flex flex-col max-lg:hidden overflow-hidden"
            >
                <div className="flex items-center border-b border-zinc-800/40 bg-zinc-900/50 p-1.5 gap-1.5 shrink-0">
                    <Skeleton accentColor={accentColor} variant="button" className="flex-1 h-7 rounded-xl" />
                    <Skeleton accentColor={accentColor} variant="button" className="flex-1 h-7 rounded-xl" />
                </div>
                <div className="flex-1 p-3 md:p-4 overflow-hidden">
                    <MetadataPanelSkeleton accentColor={accentColor} />
                </div>
            </div>
        </div>
    );
}

export function FullInitSkeleton({accentColor = "sky"}: {accentColor?: string}) {
    return (
        <div suppressHydrationWarning className="h-full flex flex-col overflow-hidden bg-linear-to-b from-zinc-950 to-black text-zinc-100 select-none font-sans">
            <HeaderSkeleton accentColor={accentColor} />
            <InitSkeleton accentColor={accentColor} />
            <StatusBarSkeleton accentColor={accentColor} />
        </div>
    );
}


