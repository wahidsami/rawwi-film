import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useLangStore } from '@/store/langStore';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactUs() {
  const { lang } = useLangStore();
  const isArabic = lang === 'ar';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!name.trim() || !email.trim() || !mobile.trim() || !message.trim()) {
      setError(isArabic ? 'يرجى تعبئة جميع الحقول' : 'Please fill in all fields');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(isArabic ? 'يرجى إدخال بريد إلكتروني صحيح' : 'Please enter a valid email');
      return;
    }

    const subject = encodeURIComponent(isArabic ? `رسالة تواصل من ${name.trim()}` : `Contact message from ${name.trim()}`);
    const body = encodeURIComponent(
      `${isArabic ? 'الاسم' : 'Name'}: ${name.trim()}\n` +
      `${isArabic ? 'البريد الإلكتروني' : 'Email'}: ${email.trim()}\n` +
      `${isArabic ? 'رقم الجوال' : 'Mobile'}: ${mobile.trim()}\n\n` +
      `${isArabic ? 'الرسالة' : 'Message'}:\n${message.trim()}`
    );

    window.location.href = `mailto:info@raawi.film?subject=${subject}&body=${body}`;
    setSuccess(isArabic ? 'تم تجهيز الرسالة. الرجاء تأكيد الإرسال من تطبيق البريد.' : 'Message prepared. Please confirm sending from your mail app.');
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12 text-text-main">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{isArabic ? 'تواصل معنا' : 'Contact Us'}</h1>
          <Link to="/">
            <Button variant="outline">{isArabic ? 'العودة' : 'Back'}</Button>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={isArabic ? 'الاسم *' : 'Name *'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label={isArabic ? 'البريد الإلكتروني *' : 'Email *'}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            dir="ltr"
          />
          <Input
            label={isArabic ? 'رقم الجوال *' : 'Mobile Number *'}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            required
            dir="ltr"
          />
          <Textarea
            label={isArabic ? 'رسالتك *' : 'Your Message *'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            required
          />

          {error && <div className="rounded-md border border-error/20 bg-error/10 p-3 text-sm text-error">{error}</div>}
          {success && <div className="rounded-md border border-success/20 bg-success/10 p-3 text-sm text-success">{success}</div>}

          <Button type="submit">{isArabic ? 'إرسال' : 'Submit'}</Button>
        </form>
      </div>
    </div>
  );
}

