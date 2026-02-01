import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReservationModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialMessage?: string;
}

export default function ReservationModal({ isOpen, onClose, initialMessage = '' }: ReservationModalProps) {
    const [message, setMessage] = useState(initialMessage);
    const [phone, setPhone] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Update message when initialMessage changes (from itinerary item)
    useEffect(() => {
        if (initialMessage) {
            setMessage(initialMessage);
        }
    }, [initialMessage, isOpen]);
    
    const [result, setResult] = useState<{
        success: boolean;
        message: string;
        screenshot?: string;
        url?: string;
    } | null>(null);

    const handleSubmit = async () => {
        if (!message.trim()) return;

        setIsLoading(true);
        setResult(null);

        try {
            const response = await fetch('http://localhost:3000/api/reservations/auto-book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, phone }),
            });

            const data = await response.json();
            setResult(data);
        } catch (error) {
            setResult({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to make reservation',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setMessage('');
        setPhone('');
        setResult(null);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto cursor-pointer"
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ 
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                            duration: 0.3 
                        }}
                        className="relative w-[420px] bg-gradient-to-b from-slate-800/95 to-slate-900/98 backdrop-blur-xl rounded-2xl border border-white/15 p-6 shadow-[0_8px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] pointer-events-auto"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1, duration: 0.3 }}
                                className="flex items-center gap-3"
                            >
                                <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                                    <i className="fa-solid fa-calendar-plus text-orange-400 text-lg"></i>
                                </div>
                                <div>
                                    <h2 className="text-white font-semibold text-lg">Quick Reserve</h2>
                                    <p className="text-white/50 text-xs">Powered by Fetch.ai</p>
                                </div>
                            </motion.div>
                            <motion.button
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.15, duration: 0.2 }}
                                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
                                whileTap={{ scale: 0.95 }}
                                onClick={handleClose}
                                className="w-8 h-8 rounded-lg bg-white/5 text-white/40 flex items-center justify-center hover:text-white/70 transition-colors"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </motion.button>
                        </div>

                        {/* Content */}
                        <AnimatePresence mode="wait">
                            {!result ? (
                                <motion.div
                                    key="form"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    {/* Message Input */}
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.15, duration: 0.3 }}
                                        className="mb-4"
                                    >
                                        <label className="block text-white/60 text-xs mb-2">What would you like to reserve?</label>
                                        <textarea
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            placeholder="e.g., Book a table at Mamma Maria for tomorrow at 7pm for 2 people"
                                            className="w-full h-24 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-black/40 resize-none transition-all"
                                            disabled={isLoading}
                                        />
                                    </motion.div>

                                    {/* Phone Input */}
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2, duration: 0.3 }}
                                        className="mb-5"
                                    >
                                        <label className="block text-white/60 text-xs mb-2">Phone Number</label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="555-123-4567"
                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 focus:bg-black/40 transition-all"
                                            disabled={isLoading}
                                        />
                                    </motion.div>

                                    {/* Submit Button */}
                                    <motion.button
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.25, duration: 0.3 }}
                                        whileHover={!isLoading && message.trim() ? { scale: 1.02, boxShadow: '0 6px 25px rgba(249,115,22,0.4)' } : {}}
                                        whileTap={!isLoading && message.trim() ? { scale: 0.98 } : {}}
                                        onClick={handleSubmit}
                                        disabled={isLoading || !message.trim()}
                                        className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${isLoading || !message.trim()
                                            ? 'bg-white/10 text-white/30 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_4px_20px_rgba(249,115,22,0.3)]'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <motion.i 
                                                    animate={{ rotate: 360 }}
                                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                    className="fa-solid fa-spinner"
                                                ></motion.i>
                                                <span>Opening browser...</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="fa-solid fa-robot"></i>
                                                <span>Make Reservation</span>
                                            </>
                                        )}
                                    </motion.button>

                                    {/* Info */}
                                    <motion.p 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.3, duration: 0.3 }}
                                        className="text-white/30 text-xs text-center mt-4"
                                    >
                                        Our AI agent will open a browser and complete your reservation automatically.
                                    </motion.p>
                                </motion.div>
                            ) : (
                                /* Result Display */
                                <motion.div 
                                    key="result"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.3 }}
                                    className="text-center"
                                >
                                    <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ 
                                            type: "spring", 
                                            stiffness: 400, 
                                            damping: 15,
                                            delay: 0.1 
                                        }}
                                        className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${result.success ? 'bg-green-500/20' : 'bg-red-500/20'}`}
                                    >
                                        <motion.i 
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ delay: 0.3, type: "spring", stiffness: 500 }}
                                            className={`fa-solid ${result.success ? 'fa-check text-green-400' : 'fa-xmark text-red-400'} text-2xl`}
                                        ></motion.i>
                                    </motion.div>

                                    <motion.h3 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                        className={`font-semibold text-lg mb-2 ${result.success ? 'text-green-400' : 'text-red-400'}`}
                                    >
                                        {result.success ? 'Reservation Submitted!' : 'Reservation Failed'}
                                    </motion.h3>

                                    <motion.p 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-white/70 text-sm mb-4"
                                    >
                                        {result.message}
                                    </motion.p>

                                    {result.url && (
                                        <motion.a
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.35 }}
                                            whileHover={{ scale: 1.05 }}
                                            href={result.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-orange-400 text-sm hover:text-orange-300 transition-colors mb-4"
                                        >
                                            <i className="fa-solid fa-external-link"></i>
                                            View Reservation
                                        </motion.a>
                                    )}

                                    <motion.button
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4 }}
                                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.15)' }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleClose}
                                        className="w-full py-3 rounded-xl bg-white/10 text-white font-medium text-sm transition-colors mt-2"
                                    >
                                        Close
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
