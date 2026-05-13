"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Brand } from "@/components/layout/Brand";

type Step = "email" | "code";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  // Detecta sesión activa (ej: magic link con token en el hash de la URL)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace(redirectTo);
        router.refresh();
      }
    });
    // También escucha cambios de sesión (cuando el cliente parsea el hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        router.replace(redirectTo);
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, redirectTo]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    submittingRef.current = false;

    if (error) {
      toast.error("No se pudo enviar el código", { description: error.message });
      return;
    }

    setStep("code");
    toast.success("Correo enviado", {
      description: "Haz click en el link del correo, o pega el código de 6 dígitos aquí.",
    });
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6 || code.length > 10 || submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });

    if (error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        toast.success("Ingreso correcto");
        router.replace(redirectTo);
        router.refresh();
        return;
      }
      setLoading(false);
      submittingRef.current = false;
      toast.error("Código inválido o expirado", { description: error.message });
      return;
    }

    toast.success("Ingreso correcto");
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-3">
        <Brand />
        <div className="space-y-1">
          <CardTitle className="text-xl">Ingresar</CardTitle>
          <CardDescription>
            {step === "email"
              ? "Ingresa con tu correo. Te enviaremos un código de acceso."
              : `Código enviado a ${email}`}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="nombre@dbs.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Mail className="mr-2 size-4" />
                  Enviar código
                </>
              )}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código de acceso</Label>
              <Input
                id="code"
                type="text"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="123456"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                disabled={loading}
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 size-4" />
                  Ingresar
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              disabled={loading}
            >
              Usar otro correo
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
