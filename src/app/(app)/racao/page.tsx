import { redirect } from "next/navigation";

// A fábrica de ração saiu; o estoque de ração fica no Estoque.
export default function Racao() {
  redirect("/estoque#racao");
}
