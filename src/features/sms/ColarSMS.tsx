import { useState } from 'react'
import { Botao, Campo, Neu, Rotulo, Selecao } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { novoId } from '@/lib/id'
import { FORMAS_PAGAMENTO, type FormaPagamento, type Lancamento } from '@/types'
import { parsearSMS } from './parsear'

const EXEMPLO =
  'Ex: Compra aprovada no seu PERSON BLACK PONTOS final 1644 - APPLECOMBILL valor RS 26,80 em 06/04, as 21h36.'

interface Rascunho {
  nome: string
  valor: string
  vencimento: string
  tp: FormaPagamento
  cat: string
}

/** Cola a notificação do banco e o app extrai os dados da compra. */
export function ColarSMS({
  catDespesa,
  contaPadrao,
  aoAdicionar,
}: {
  catDespesa: string[]
  contaPadrao: string
  aoAdicionar: (l: Lancamento) => void
}) {
  const [texto, setTexto] = useState('')
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState(false)

  function extrair() {
    setErro(false)
    const r = parsearSMS(texto)
    if (!r) {
      setRascunho(null)
      setErro(true)
      return
    }
    setRascunho({
      nome: r.nome,
      valor: String(r.valor),
      vencimento: r.vencimento,
      tp: r.tp,
      cat: catDespesa[0] ?? 'Outros',
    })
  }

  function salvar() {
    if (!rascunho) return
    const valor = Number(rascunho.valor.replace(',', '.'))
    if (!rascunho.nome.trim() || !Number.isFinite(valor) || valor <= 0) return

    aoAdicionar({
      id: novoId(),
      tl: 'despesa',
      nome: rascunho.nome.trim(),
      valor,
      vencimento: rascunho.vencimento,
      tp: rascunho.tp,
      cat: rascunho.cat,
      // compra no cartão já saiu da conta: entra como paga na data da compra
      pago: true,
      data_pgto: rascunho.vencimento,
      conta: contaPadrao,
      recorrenciaId: null,
      updatedAt: Date.now(),
    })

    setTexto('')
    setRascunho(null)
  }

  function limpar() {
    setTexto('')
    setRascunho(null)
    setErro(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <Neu className="p-4" sombra="neu-xs">
        <h3 className="text-[13px] font-bold text-tinta">📋 Colar SMS de compra</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          Cole o texto da notificação do banco. O app extrai valor, data e estabelecimento.
        </p>
      </Neu>

      <Neu className="p-4" sombra="neu-xs">
        <Rotulo>Texto da notificação</Rotulo>
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setRascunho(null)
            setErro(false)
          }}
          placeholder={EXEMPLO}
          rows={4}
          className="w-full resize-y px-3.5 py-3 leading-relaxed text-tinta"
        />
        <div className="mt-2.5 flex gap-2.5">
          <Botao
            variante="primario"
            className="flex-[2]"
            disabled={!texto.trim()}
            onClick={extrair}
          >
            🔍 Extrair dados
          </Botao>
          {texto ? (
            <Botao onClick={limpar} aria-label="Limpar texto">
              ✕
            </Botao>
          ) : null}
        </div>
      </Neu>

      {erro ? (
        <div className="rounded-2xl bg-despesa/10 p-3.5 text-[13px] font-semibold text-despesa">
          ⚠️ Não foi possível encontrar o valor. Confira o texto e tente de novo.
        </div>
      ) : null}

      {rascunho ? (
        <Neu className="p-4" sombra="neu-xs">
          <h3 className="mb-3 text-[13px] font-bold text-tinta">✏️ Confirme os dados</h3>
          <div className="flex flex-col gap-3.5">
            <div>
              <Rotulo>Descrição</Rotulo>
              <Campo
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Rotulo>Valor (R$)</Rotulo>
                <Campo
                  value={rascunho.valor}
                  inputMode="decimal"
                  onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div>
                <Rotulo>Data</Rotulo>
                <Campo
                  type="date"
                  value={rascunho.vencimento}
                  onChange={(e) => setRascunho({ ...rascunho, vencimento: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Rotulo>Forma de pagamento</Rotulo>
              <Selecao
                value={rascunho.tp}
                onChange={(e) =>
                  setRascunho({ ...rascunho, tp: e.target.value as FormaPagamento })
                }
              >
                {FORMAS_PAGAMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Selecao>
            </div>
            <div>
              <Rotulo>Categoria</Rotulo>
              <Selecao
                value={rascunho.cat}
                onChange={(e) => setRascunho({ ...rascunho, cat: e.target.value })}
              >
                {catDespesa.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Selecao>
            </div>

            <div className="rounded-xl bg-fundo px-3.5 py-2.5 shadow-neu-in-sm">
              <span className="text-[11px] text-tinta-3">Vai lançar </span>
              <span className="font-mono text-[13px] font-bold text-despesa">
                {fmtR(Number(rascunho.valor.replace(',', '.')) || 0)}
              </span>
            </div>

            <Botao variante="primario" onClick={salvar}>
              Adicionar lançamento
            </Botao>
          </div>
        </Neu>
      ) : null}
    </div>
  )
}
