import { redirect } from "next/navigation";

// El proxy ya redirige / segun sesion, pero por seguridad redirigimos aqui tambien.
export default function Home() {
  redirect("/dashboard");
}
