import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useLangStore } from '@/store/langStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';

export function ResetPassword() {
    const navigate = useNavigate();
    const { lang, toggleLang } = useLangStore();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [validToken, setValidToken] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Verify the recovery token on mount
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');

        if (type === 'recovery' && accessToken) {
            setValidToken(true);
        } else {
            toast.error(lang === 'ar' ? 'رابط غير صالح أو منتهي الصلاحية' : 'Invalid or expired reset link');
        }
        setLoading(false);
    }, [lang]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password.length < 8) {
            toast.error(lang === 'ar' ? 'كلمة المرور 8 أحرف على الأقل' : 'Password must be at least 8 characters');
            return;
        }

        const hasLetter = /[a-zA-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        if (!hasLetter || !hasNumber) {
            toast.error(lang === 'ar' ? 'كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل' : 'Password must contain at least one letter and one number');
            return;
        }

        if (password !== confirmPassword) {
            toast.error(lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match');
            return;
        }

        setSubmitting(true);

        try {
            const { error } = await supabase.auth.updateUser({ password });

            if (error) throw error;

            toast.success(lang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password updated successfully');
            setTimeout(() => navigate('/login', { replace: true }), 1500);
        } catch (err: any) {
            toast.error(err?.message ?? (lang === 'ar' ? 'فشل تغيير كلمة المرور' : 'Failed to update password'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center">
                    <p className="text-text-muted">{lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
                </div>
            </div>
        );
    }

    if (!validToken) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border text-center space-y-4">
                    <p className="text-error font-medium">{lang === 'ar' ? 'رابط غير صالح أو منتهي الصلاحية' : 'Invalid or expired reset link'}</p>
                    <p className="text-sm text-text-muted">
                        {lang === 'ar' ? 'يرجى طلب رابط جديد لإعادة تعيين كلمة المرور.' : 'Please request a new password reset link.'}
                    </p>
                    <Button onClick={() => navigate('/forgot-password')} className="mt-4">
                        {lang === 'ar' ? 'طلب رابط جديد' : 'Request New Link'}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-background text-text-main">
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-md bg-surface p-8 rounded-2xl shadow-xl border border-border relative">
                    <button
                        onClick={toggleLang}
                        className="absolute top-4 right-4 flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors px-2.5 py-1.5 rounded-md hover:bg-background border border-border"
                    >
                        <Globe className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
                    </button>

                    <div className="space-y-1 mb-6">
                        <h1 className="text-2xl font-bold text-text-main">
                            {lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
                        </h1>
                        <p className="text-sm text-text-muted">
                            {lang === 'ar' ? 'أدخل كلمة مرور جديدة لحسابك' : 'Enter a new password for your account'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            label={lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            dir="ltr"
                            autoComplete="new-password"
                        />
                        <Input
                            label={lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={8}
                            dir="ltr"
                            autoComplete="new-password"
                        />

                        <div className="p-2.5 text-xs text-text-muted bg-background/50 border border-border rounded-md">
                            {lang === 'ar'
                                ? 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل، وتتضمن حرفاً ورقماً'
                                : 'Password must be at least 8 characters and contain both letters and numbers'}
                        </div>

                        <Button type="submit" className="w-full" disabled={submitting}>
                            {submitting
                                ? (lang === 'ar' ? 'جاري الحفظ…' : 'Updating...')
                                : (lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    );
}
