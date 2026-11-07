export const CATEGORIAS_CARTAO = ['Alimentação', 'Saúde', 'Moradia', 'Transporte', 'Compras', 'Assinatura', 'Lazer', 'Viagem', 'Educação', 'Serviços', 'Outros'] as const

/** Sugestão simples, editável pelo usuário na prévia ou após salvar. */
export function sugerirCategoria(descricao: string): string {
  const s = descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  if (/SUPERMERC|ATACAD|MERCAD|PADARIA|PANIFIC|RESTAUR|LANCH|BURGER|PIZZA|IFOOD|RAPPI|CAFE|ACAI|FRIGORIF|DOCERIA/.test(s)) return 'Alimentação'
  if (/FARMAC|DROGAR|DROGASIL|DROGA RAIA|DROGARIA|HOSPITAL|CLINIC|LABORAT|MEDIC|DENT|OTICA|RDSAUDE/.test(s)) return 'Saúde'
  if (/UBER|99APP|TAXI|POSTO |COMBUST|ESTACION|PEDAG|AUTO PEC|OFICINA/.test(s)) return 'Transporte'
  if (/NETFLIX|SPOTIFY|AMAZON PRIME|DISNEY|APPLE.COM|GOOGLE ONE|YOUTUBE PREMIUM|HBO|DEEZER/.test(s)) return 'Assinatura'
  if (/HOTEL|POUSADA|AIRBNB|BOOKING|LATAM|AZUL LINHAS|GOL LINHAS|PASSAGEM/.test(s)) return 'Viagem'
  if (/CINEMA|TEATRO|INGRESS|SHOW |EVENTO|PARQUE|BOLICHE/.test(s)) return 'Lazer'
  if (/ESCOLA|COLEGIO|FACULDADE|UNIVERS|CURSO|LIVRARIA/.test(s)) return 'Educação'
  if (/ENERGIA|AGUA |CONDOMIN|MATERIAL DE CONSTR|LEROY|CASA &|CASA E/.test(s)) return 'Moradia'
  if (/AMAZON|MERCADO LIVRE|SHOPEE|MAGALU|RENNER|RIACHUELO|CENTAURO|BOUTIQUE|LOJA /.test(s)) return 'Compras'
  if (/SEGURO|ASSISTENCIA|CONSULTORIA|SERVICO|CARTORIO/.test(s)) return 'Serviços'
  return 'Outros'
}
