/**
 * Hook genérico para carregar dados de uma requisição assíncrona, expondo
 * estado de carregamento, erro, recarga e "pull-to-refresh". Padroniza o
 * consumo dos serviços de API nas telas.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';

interface EstadoRequisicao<T> {
  dados: T | null;
  carregando: boolean;
  atualizando: boolean;
  erro: string | null;
  recarregar: () => void;
}

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ApiError) {
    return erro.message;
  }
  if (erro instanceof Error) {
    return erro.message;
  }
  return 'Ocorreu um erro inesperado.';
}

export function useRequisicao<T>(
  buscar: () => Promise<T>,
  dependencias: unknown[] = [],
): EstadoRequisicao<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const executar = useCallback(
    async (ehAtualizacao: boolean) => {
      if (ehAtualizacao) {
        setAtualizando(true);
      } else {
        setCarregando(true);
      }
      setErro(null);
      try {
        const resultado = await buscar();
        setDados(resultado);
      } catch (e) {
        setErro(mensagemDeErro(e));
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencias,
  );

  useEffect(() => {
    void executar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  const recarregar = useCallback(() => {
    void executar(true);
  }, [executar]);

  return { dados, carregando, atualizando, erro, recarregar };
}
