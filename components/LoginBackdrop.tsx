/**
 * Fond de la page de connexion : un catalogue factice flouté (logos des marques, blocs gris). Aucune donnée réelle :
 * ni produit ni prix ne sont envoyés avant la saisie du code.
 */
const LOGOS = ["mecafe", "kimbo", "caffitaly", "odk", "foodness", "flair"];

export function LoginBackdrop() {
  return (
    <div className="login-backdrop" aria-hidden="true">
      <div className="login-backdrop-bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mecafe-logo-sm.png" alt="" width={480} height={156} />
        <span />
      </div>
      <div className="login-backdrop-grid">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="login-backdrop-card">
            <div className="login-backdrop-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/brands/${LOGOS[i % LOGOS.length]}.png`} alt="" width={256} height={256} />
            </div>
            <span className="login-backdrop-line" />
            <span className="login-backdrop-line short" />
            <span className="login-backdrop-price" />
          </div>
        ))}
      </div>
    </div>
  );
}
