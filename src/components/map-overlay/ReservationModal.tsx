import { useState, useEffect } from 'react';

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto cursor-pointer"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-[420px] bg-gradient-to-b from-slate-800/95 to-slate-900/98 backdrop-blur-xl rounded-2xl border border-white/15 p-6 shadow-[0_8px_50px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] pointer-events-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                            <i className="fa-solid fa-calendar-plus text-orange-400 text-lg"></i>
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-lg">Quick Reserve</h2>
                            <p className="text-white/50 text-xs">Powered by Fetch.ai</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 rounded-lg bg-white/5 text-white/40 flex items-center justify-center hover:bg-white/10 hover:text-white/70 transition-all"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Content */}
                {!result ? (
                    <>
                        {/* Message Input */}
                        <div className="mb-4">
                            <label className="block text-white/60 text-xs mb-2">What would you like to reserve?</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="e.g., Book a table at Mamma Maria for tomorrow at 7pm for 2 people"
                                className="w-full h-24 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 resize-none transition-all"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Phone Input */}
                        <div className="mb-5">
                            <label className="block text-white/60 text-xs mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="555-123-4567"
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-orange-500/50 transition-all"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleSubmit}
                            disabled={isLoading || !message.trim()}
                            className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${isLoading || !message.trim()
                                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                                : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-[0_4px_20px_rgba(249,115,22,0.3)]'
                                }`}
                        >
                            {isLoading ? (
                                <>
                                    <i className="fa-solid fa-spinner animate-spin"></i>
                                    <span>Opening browser...</span>
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-robot"></i>
                                    <span>Make Reservation</span>
                                </>
                            )}
                        </button>

                        {/* Info */}
                        <p className="text-white/30 text-xs text-center mt-4">
                            Our AI agent will open a browser and complete your reservation automatically.
                        </p>
                    </>
                ) : (
                    /* Result Display */
                    <div className="text-center">
                        <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${result.success ? 'bg-green-500/20' : 'bg-red-500/20'
                            }`}>
                            <i className={`fa-solid ${result.success ? 'fa-check text-green-400' : 'fa-xmark text-red-400'} text-2xl`}></i>
                        </div>

                        <h3 className={`font-semibold text-lg mb-2 ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                            {result.success ? 'Reservation Submitted!' : 'Reservation Failed'}
                        </h3>

                        <p className="text-white/70 text-sm mb-4">{result.message}</p>

                        {result.url && (
                            <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-orange-400 text-sm hover:text-orange-300 transition-colors mb-4"
                            >
                                <i className="fa-solid fa-external-link"></i>
                                View Reservation
                            </a>
                        )}

                        <button
                            onClick={handleClose}
                            className="w-full py-3 rounded-xl bg-white/10 text-white font-medium text-sm hover:bg-white/15 transition-all mt-2"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
