import type {Transition} from "framer-motion";


const contentTransition: Transition = {
    duration: 0.25,
    ease: "easeInOut",
};

/** General content fade+slide animation (non-modal elements). */
export const contentMotion = {
    initial: {opacity: 0, y: 8},
    animate: {opacity: 1, y: 0},
    exit: {opacity: 0, y: -8},
    transition: contentTransition,
};

/** Directional folder navigation animation (drill-in & drill-out). */
export const folderNavVariants = {
    initial: (direction: 'forward' | 'backward') => ({
        opacity: 0,
        x: direction === 'forward' ? 24 : -24,
    }),
    animate: {
        opacity: 1,
        x: 0,
        transition: {
            duration: 0.2,
            ease: [0.25, 1, 0.5, 1],
        },
    },
    exit: (direction: 'forward' | 'backward') => ({
        opacity: 0,
        x: direction === 'forward' ? -24 : 24,
        transition: {
            duration: 0.14,
            ease: [0.4, 0, 1, 1],
        },
    }),
};

/** Shared modal backdrop fade animation. */
export const backdropMotion = {
    initial: {opacity: 0},
    animate: {opacity: 1},
    exit: {opacity: 0},
    transition: {duration: 0.2, ease: "easeInOut" as const},
};

/** Shared modal content scale+slide animation. */
export const modalContentMotion = {
    initial: {opacity: 0},
    animate: {opacity: 1},
    exit: {opacity: 0},
    transition: {duration: 0.25} as Transition,
};
