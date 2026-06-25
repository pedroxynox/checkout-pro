/**
 * Logo "Pulse C" do Check-out Pro (marca / identidade).
 *
 * Símbolo vetorial (escala sem perder qualidade): um "C" (Check-out) com uma
 * linha de pulso/batimento (a "Saúde do Negócio") que cruza o centro e termina
 * num nó/spark (a inteligência da Cluby).
 *
 * Uso:
 *  - `<LogoPulseC cor="#FFF" />`  → só a marca (ex.: no login, sobre o azul).
 *  - `<LogoPulseC comTile />`     → marca branca sobre azulejo com degradê
 *    (ex.: app icon). Arquivos-fonte para exportar PNG: `assets/app-icon.svg`
 *    e `assets/logo-pulse-c.svg`.
 */
import React from 'react';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

interface Props {
  /** Tamanho (largura = altura), em px. */
  size?: number;
  /** Cor do traço quando SEM azulejo (ex.: branco sobre fundo escuro). */
  cor?: string;
  /** Mostra o azulejo azul com degradê (marca em branco). Para app icon. */
  comTile?: boolean;
}

export function LogoPulseC({
  size = 96,
  cor = '#FFFFFF',
  comTile = false,
}: Props): React.ReactElement {
  const traco = comTile ? '#FFFFFF' : cor;
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      {comTile ? (
        <>
          <Defs>
            <LinearGradient id="logoTile" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#0F4C81" />
              <Stop offset="1" stopColor="#0A2540" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="512" height="512" rx="112" fill="url(#logoTile)" />
        </>
      ) : null}

      {/* "C" (aberto à direita) */}
      <Path
        d="M362 150 A150 150 0 1 0 362 362"
        fill="none"
        stroke={traco}
        strokeWidth={46}
        strokeLinecap="round"
      />
      {/* Linha de pulso (batimento) cruzando o centro */}
      <Path
        d="M150 256 L200 256 L220 236 L244 300 L270 206 L296 264 L316 256 L360 256"
        fill="none"
        stroke={traco}
        strokeWidth={34}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Nó / spark (inteligência) */}
      <Circle cx="384" cy="256" r="18" fill={traco} />
    </Svg>
  );
}

export default LogoPulseC;
