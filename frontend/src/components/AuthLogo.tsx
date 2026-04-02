export function AuthLogo() {
  return (
    <div className="flex items-center justify-center gap-3 mb-8">
      <img
        src="/logo.png"
        alt="DeepReview"
        className="w-12 h-12 rounded-2xl object-cover shadow-lg"
      />
      <span className="text-2xl font-bold text-white tracking-tight">
        Deep<span className="text-primary">Review</span>
      </span>
    </div>
  );
}