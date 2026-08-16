import { useEffect, useRef, useState } from 'react'
import { Botao, Neu } from '@/components/ui'
import { useLoja } from '@/state/store'
import {
  diagnosticoStorage,
  estadoDeExemplo,
  migrarV4Forcado,
  normalizarEstado,
  migrarV4,
  type Diagnostico,
} from '@/storage/migrar'
import { estadoVazio, type ArquivoBackup } from '@/types'

/**
 * Tela da primeira abertura, quando não há nada no storage.
 *
 * O app não escolhe sozinho: até o usuário decidir, nada é gravado. Isso
 * evita o pior modo de falha da versão anterior — abrir num storage vazio,
 * gravar a base de exemplo como `fin-v5` e com isso bloquear para sempre a
 * migração dos dados antigos que continuavam ali do lado.
 */
export function PrimeiraAbertura() {
  const { resolverPrimeiraAbertura } = useLoja()
  const [diag, setDiag] = useState<Diagnostico | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void diagnosticoStorage().then(setDiag)
  }, [])

  const temV4 = !!diag && [...diag.idb, ...diag.ls].some((i) => i.chave === 'fin-v4')
  const qtdV4 =
    [...(diag?.idb ?? []), ...(diag?.ls ?? [])].find((i) => i.chave === 'fin-v4')?.lancamentos ??
    null

  async function recuperarV4() {
    setOcupado(true)
    setErro(null)
    const r = await migrarV4Forcado()
    setOcupado(false)
    if (!r) {
      setErro('Não encontrei dados do app antigo neste aparelho.')
      return
    }
    resolverPrimeiraAbertura(r.estado)
  }

  function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    const leitor = new FileReader()
    leitor.onload = (ev) => {
      try {
        const dados = JSON.parse(String(ev.target?.result)) as ArquivoBackup
        const novo =
          normalizarEstado(dados.estado) ??
          (dados.financas
            ? migrarV4(dados.financas as Record<string, unknown>, dados.categorias).estado
            : null)
        if (!novo) throw new Error('inválido')
        resolverPrimeiraAbertura(novo)
      } catch {
        setErro('Arquivo de backup inválido.')
      }
    }
    leitor.readAsText(arq)
  }

  return (
    <div className="pad-topo pad-base mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-4 px-5 py-8">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-superficie text-3xl shadow-neu">
          📭
        </div>
        <h1 className="mt-4 text-lg font-bold text-tinta">Nenhum dado neste aparelho</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-tinta-2">
          Nada foi gravado ainda. Escolha por onde começar — seus dados antigos, se existirem,
          continuam intactos até você decidir.
        </p>
      </div>

      {temV4 ? (
        <Neu className="p-4">
          <h2 className="text-[14px] font-bold text-tinta">
            ✅ Encontrei dados do app antigo
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
            {qtdV4 !== null
              ? `${qtdV4} lançamentos guardados na chave fin-v4.`
              : 'Há dados guardados na chave fin-v4.'}{' '}
            É quase certo que seja isto que você quer.
          </p>
          <Botao
            variante="primario"
            className="mt-3 w-full"
            disabled={ocupado}
            onClick={() => void recuperarV4()}
          >
            {ocupado ? 'Recuperando…' : 'Recuperar meus dados'}
          </Botao>
        </Neu>
      ) : (
        <Neu className="p-4" sombra="neu-xs">
          <h2 className="text-[14px] font-bold text-tinta">Sem dados do app antigo aqui</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
            Não achei a chave <code className="font-mono">fin-v4</code> neste armazenamento. Se
            você usava o app pelo ícone da tela de início, abra por ele — no iOS o app instalado
            e o Safari podem ter armazenamentos separados. Ou restaure pelo backup.
          </p>
        </Neu>
      )}

      <Neu className="p-4" sombra="neu-xs">
        <h2 className="text-[14px] font-bold text-tinta">Restaurar de um backup</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          Aceita o JSON exportado por esta versão ou pelo app antigo.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={importar}
          className="hidden"
        />
        <Botao
          variante={temV4 ? 'suave' : 'primario'}
          className="mt-3 w-full"
          onClick={() => inputRef.current?.click()}
        >
          📂 Escolher arquivo
        </Botao>
      </Neu>

      <div className="flex gap-2.5">
        <Botao className="flex-1" onClick={() => resolverPrimeiraAbertura(estadoVazio())}>
          Começar vazio
        </Botao>
        <Botao className="flex-1" onClick={() => resolverPrimeiraAbertura(estadoDeExemplo())}>
          Dados de exemplo
        </Botao>
      </div>

      {erro ? (
        <p className="text-center text-[12px] font-semibold text-despesa">{erro}</p>
      ) : null}

      {diag ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-center text-[11px] text-tinta-3">
            Ver o que existe no armazenamento
          </summary>
          <Neu className="mt-2 p-3.5" sombra="neu-in">
            <TabelaDiag titulo="IndexedDB" itens={diag.idb} />
            <TabelaDiag titulo="localStorage" itens={diag.ls} />
          </Neu>
        </details>
      ) : null}
    </div>
  )
}

function TabelaDiag({
  titulo,
  itens,
}: {
  titulo: string
  itens: { chave: string; bytes: number; lancamentos: number | null }[]
}) {
  return (
    <div className="mb-2 last:mb-0">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="mt-0.5 text-[12px] text-tinta-3">vazio</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {itens.map((i) => (
            <li key={i.chave} className="flex justify-between gap-2 font-mono text-[11px]">
              <span className="text-tinta">{i.chave}</span>
              <span className="text-tinta-2">
                {i.lancamentos !== null ? `${i.lancamentos} lanç. · ` : ''}
                {(i.bytes / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
