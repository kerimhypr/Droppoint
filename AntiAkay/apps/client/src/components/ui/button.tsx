import * as React from "react";

export function Button({ className = "", variant = "primary", size="md", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary"|"secondary"|"ghost"|"danger"; size?: "sm"|"md"|"lg" }) {
  const base = "inline-flex items-center justify-center rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string,string> = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700",
    ghost: "bg-transparent text-slate-300 hover:bg-slate-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
  };
  const sizes: Record<string,string> = { sm:"h-8 px-3 text-sm", md:"h-10 px-4 text-sm", lg:"h-12 px-6 text-base" };
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { className="", error, ...rest } = props;
  return (
    <div className="w-full">
      <input className={`w-full rounded-lg border bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${error ? "border-red-500" : "border-slate-700"} ${className}`} {...rest} />
      {error && <p className="mt-1.5 text-xs text-red-400" role="alert">{error}</p>}
    </div>
  );
}
export function Card({ className="", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur ${className}`} {...props} />;
}
export function Badge({ children, className="" }: { children: React.ReactNode; className?:string }) {
  return <span className={`inline-flex items-center rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300 ${className}`}>{children}</span>;
}
