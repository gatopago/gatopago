export type LegalCopy = {
  title: string;
  updated: string;
  lead: string;
  sections: { h: string; p?: string[]; list?: string[] }[];
};
export const terms: Record<'es' | 'en', LegalCopy> = {
  es: {
    title: 'Términos de Servicio',
    updated: 'Última actualización: 2 de octubre de 2026',
    lead: 'Estos Términos de Servicio regulan el uso de GatoPago, una aplicación de pagos no custodial para enviar, recibir y cobrar USDC con links de pago, códigos QR y nombres de usuario. GatoPago es operada por Daniel Cueto (Bolivia). Al usar GatoPago, aceptas estos términos.',
    sections: [
      {
        h: '1. Aceptación',
        p: [
          'Al acceder o usar GatoPago, confirmas que has leído y aceptas estos Términos. Si no estás de acuerdo, no uses el servicio.',
        ],
      },
      {
        h: '2. Descripción del servicio',
        p: [
          'GatoPago es una aplicación web que facilita pagos en USDC y otros activos compatibles mediante links, códigos QR y usernames. GatoPago se encuentra en desarrollo activo y sus funciones pueden cambiar o estar disponibles de forma gradual.',
        ],
      },
      {
        h: '3. Elegibilidad',
        p: [
          'Debes tener la mayoría de edad legal en tu jurisdicción y capacidad para celebrar contratos. No debes usar GatoPago si te lo prohíben las leyes que te apliquen.',
        ],
      },
      {
        h: '4. Carácter no custodial y tu responsabilidad',
        list: [
          'Tú controlas tu wallet, tus llaves y tus fondos. GatoPago no puede restablecer el acceso si pierdes todas las llaves autorizadas. Conserva el acceso a tu gestor de passkeys y a las llaves adicionales que hayas autorizado.',
          'Las transacciones en blockchain son, por lo general, irreversibles. Verifica los datos antes de confirmar.',
          'Eres responsable de mantener seguro el acceso a tu cuenta y a tu wallet.',
          'No nos hacemos responsables de pérdidas derivadas de errores del usuario, accesos no autorizados a tu cuenta o fallos de redes de terceros.',
        ],
      },
      {
        h: '5. Uso aceptable',
        p: [
          'Te comprometes a no usar GatoPago para actividades ilegales, fraude, lavado de dinero, financiamiento de actividades prohibidas o cualquier uso que infrinja la ley o derechos de terceros.',
        ],
      },
      {
        h: '6. Riesgos y ausencia de asesoría',
        p: [
          'Los activos digitales son volátiles y conllevan riesgos. GatoPago no brinda asesoría financiera, legal ni fiscal. Las decisiones sobre tus activos son tuyas.',
        ],
      },
      {
        h: '7. Comisiones',
        p: [
          'GatoPago cobra 0% por enviar dinero entre sus usuarios. Una red, protocolo o proveedor externo puede aplicar costos propios; cualquier costo conocido se muestra antes de confirmar.',
        ],
      },
      {
        h: '8. Servicios de terceros',
        p: [
          'GatoPago integra servicios de terceros para autenticación, verificación de seguridad, infraestructura y redes blockchain. El uso de esos servicios puede estar sujeto a sus propios términos y políticas.',
        ],
      },
      {
        h: '9. Sin garantías',
        p: [
          'El servicio se ofrece “tal cual” y “según disponibilidad”, sin garantías de ningún tipo, en la medida permitida por la ley. No garantizamos que el servicio sea ininterrumpido o libre de errores.',
        ],
      },
      {
        h: '10. Limitación de responsabilidad',
        p: [
          'En la máxima medida permitida por la ley, GatoPago y su operador no serán responsables por daños indirectos, incidentales o consecuentes, ni por pérdida de fondos derivada del uso del servicio o de redes de terceros.',
        ],
      },
      {
        h: '11. Cambios',
        p: [
          'Podemos modificar el servicio o estos Términos. Publicaremos la versión vigente en esta página. El uso continuado implica la aceptación de los cambios.',
        ],
      },
      {
        h: '12. Ley aplicable',
        p: [
          'Estos Términos se rigen por las leyes de Bolivia, sin perjuicio de los derechos que te correspondan como consumidor en tu jurisdicción.',
        ],
      },
      {
        h: '13. Contacto',
        p: ['Para cualquier consulta sobre estos Términos, escríbenos a {{privacyEmail}}.'],
      },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: October 2, 2026',
    lead: 'These Terms of Service govern the use of GatoPago, a non-custodial payment application to send, receive and request USDC using payment links, QR codes and usernames. GatoPago is operated by Daniel Cueto (Bolivia). By using GatoPago, you accept these terms.',
    sections: [
      {
        h: '1. Acceptance',
        p: [
          'By accessing or using GatoPago, you confirm that you have read and accept these Terms. If you do not agree, do not use the service.',
        ],
      },
      {
        h: '2. Description of the service',
        p: [
          'GatoPago is a web application that facilitates payments in USDC and other supported assets through links, QR codes and usernames. GatoPago is under active development and its features may change or roll out gradually.',
        ],
      },
      {
        h: '3. Eligibility',
        p: [
          'You must be of legal age in your jurisdiction and able to enter into contracts. You must not use GatoPago if the laws that apply to you prohibit it.',
        ],
      },
      {
        h: '4. Non-custodial nature and your responsibility',
        list: [
          'You control your wallet, keys and funds. GatoPago cannot restore access if you lose all authorized keys. Keep access to your passkey manager and any additional keys you have authorized.',
          'Blockchain transactions are generally irreversible. Verify the details before confirming.',
          'You are responsible for keeping access to your account and wallet secure.',
          'We are not responsible for losses arising from user error, unauthorized access to your account, or failures of third-party networks.',
        ],
      },
      {
        h: '5. Acceptable use',
        p: [
          'You agree not to use GatoPago for illegal activity, fraud, money laundering, financing of prohibited activities, or any use that infringes the law or the rights of others.',
        ],
      },
      {
        h: '6. Risks and no advice',
        p: [
          'Digital assets are volatile and carry risk. GatoPago does not provide financial, legal or tax advice. Decisions about your assets are yours.',
        ],
      },
      {
        h: '7. Fees',
        p: [
          'GatoPago charges 0% for sending money between its users. A network, protocol or external provider may apply its own costs; any known cost is shown before confirmation.',
        ],
      },
      {
        h: '8. Third-party services',
        p: [
          'GatoPago integrates third-party services for authentication, security checks, infrastructure and blockchain networks. Use of those services may be subject to their own terms and policies.',
        ],
      },
      {
        h: '9. No warranties',
        p: [
          'The service is provided “as is” and “as available”, without warranties of any kind, to the extent permitted by law. We do not guarantee that the service will be uninterrupted or error-free.',
        ],
      },
      {
        h: '10. Limitation of liability',
        p: [
          'To the maximum extent permitted by law, GatoPago and its operator will not be liable for indirect, incidental or consequential damages, nor for loss of funds arising from use of the service or third-party networks.',
        ],
      },
      {
        h: '11. Changes',
        p: [
          'We may modify the service or these Terms. We will post the current version on this page. Continued use means acceptance of the changes.',
        ],
      },
      {
        h: '12. Governing law',
        p: [
          'These Terms are governed by the laws of Bolivia, without prejudice to any consumer rights you may have in your jurisdiction.',
        ],
      },
      {
        h: '13. Contact',
        p: ['For any question about these Terms, contact us at {{privacyEmail}}.'],
      },
    ],
  },
};
export const privacy: Record<'es' | 'en', LegalCopy> = {
  es: {
    title: 'Política de Privacidad',
    updated: 'Última actualización: 2 de octubre de 2026',
    lead: 'GatoPago es una aplicación de pagos no custodial que permite enviar, recibir y cobrar USDC mediante links de pago, códigos QR y nombres de usuario. Esta Política de Privacidad explica qué datos tratamos, cómo los usamos y qué control tienes sobre ellos. GatoPago es operada por Daniel Cueto (Bolivia). Para cualquier consulta de privacidad, escríbenos a {{privacyEmail}}.',
    sections: [
      {
        h: 'Naturaleza no custodial',
        p: [
          'Tú mantienes el control de tu cuenta mediante las llaves autorizadas. GatoPago no puede recuperar tus fondos si pierdes todas esas llaves. Las transacciones ocurren directamente en blockchain.',
        ],
      },
      {
        h: 'Información que recopilamos',
        list: [
          'Datos de acceso: tu nombre, nombre de usuario, invitación y la información pública de tu passkey necesaria para crear y autenticar la cuenta. La clave privada permanece en tu dispositivo o gestor de passkeys.',
          'Datos de perfil: el nombre de usuario (username) y la información de perfil que eliges dentro de GatoPago.',
          'Datos de investigación de producto: si expresas interés en GatoPago Card, guardamos el país, casos de uso y preferencias que respondes. Esto no constituye una solicitud de tarjeta ni datos de KYC.',
          'Datos on-chain: tu(s) dirección(es) de wallet y las transacciones asociadas, que son públicas por naturaleza en la blockchain.',
          'Datos técnicos y de uso: tipo de dispositivo, navegador, dirección IP aproximada y métricas de uso anónimas o agregadas para mejorar el servicio.',
          'Comunicaciones: la información que nos envías si nos contactas por correo.',
        ],
      },
      {
        h: 'Cómo usamos tu información',
        list: [
          'Crear tu cuenta, autenticarte y darte acceso al servicio.',
          'Permitir las funciones de pago (links, QR y usernames).',
          'Proteger la cuenta, prevenir fraude y abuso, y mantener la seguridad.',
          'Brindar soporte y responder tus mensajes.',
          'Mejorar y entender el uso del producto.',
          'Cumplir obligaciones legales aplicables.',
        ],
      },
      {
        h: 'Cómo compartimos la información',
        p: [
          'No vendemos tus datos personales. Podemos compartir información con proveedores que nos ayudan a operar (por ejemplo, hosting, autenticación y analítica), bajo acuerdos que limitan su uso. Los datos on-chain son públicos por la naturaleza de la blockchain. También podemos divulgar información cuando la ley lo requiera o para proteger derechos y seguridad.',
        ],
      },
      {
        h: 'Conservación de datos',
        p: [
          'Conservamos tus datos mientras tu cuenta esté activa o según sea necesario para prestar el servicio y cumplir obligaciones legales. Puedes solicitar la eliminación de tu cuenta y datos asociados escribiéndonos.',
        ],
      },
      {
        h: 'Seguridad',
        p: [
          'Aplicamos medidas razonables para proteger tu información. Ningún sistema es 100% seguro, pero al ser no custodial, tus fondos permanecen bajo tu control y no en nuestros servidores.',
        ],
      },
      {
        h: 'Tus derechos',
        p: [
          'Puedes solicitar acceder, corregir o eliminar tus datos personales. Para ejercer estos derechos, escríbenos a {{privacyEmail}}. Las transacciones ya publicadas en blockchain permanecen en esa red.',
        ],
      },
      {
        h: 'Menores de edad',
        p: [
          'GatoPago no está dirigida a menores de edad y no recopilamos conscientemente datos de personas que no tengan la mayoría de edad legal en su jurisdicción.',
        ],
      },
      {
        h: 'Cambios a esta política',
        p: [
          'Podemos actualizar esta Política de Privacidad. Publicaremos la versión vigente en esta página con su fecha de actualización.',
        ],
      },
      {
        h: 'Contacto',
        p: [
          'Si tienes preguntas sobre esta política o sobre tus datos, escríbenos a {{privacyEmail}}.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 2, 2026',
    lead: 'GatoPago is a non-custodial payment application that lets users send, receive and request USDC using payment links, QR codes and usernames. This Privacy Policy explains what data we process, how we use it and what control you have over it. GatoPago is operated by Daniel Cueto (Bolivia). For any privacy question, contact us at {{privacyEmail}}.',
    sections: [
      {
        h: 'Non-custodial nature',
        p: [
          'You control your account through its authorized keys. GatoPago cannot recover your funds if you lose all those keys. Transactions happen directly on the blockchain.',
        ],
      },
      {
        h: 'Information we collect',
        list: [
          'Access data: your name, username, invitation and the public passkey information needed to create and authenticate your account. The private key remains on your device or in your passkey manager.',
          'Profile data: the username and profile information you choose within GatoPago.',
          'Product research data: if you express interest in GatoPago Card, we store the country, use cases and preferences you submit. This is not a card application or KYC data.',
          'On-chain data: your wallet address(es) and associated transactions, which are public by nature on the blockchain.',
          'Technical and usage data: device type, browser, approximate IP address and anonymous or aggregated usage metrics to improve the service.',
          'Communications: the information you send us if you contact us by email.',
        ],
      },
      {
        h: 'How we use your information',
        list: [
          'Create your account, authenticate you and give you access to the service.',
          'Enable the payment features (links, QR and usernames).',
          'Protect your account, prevent fraud and abuse, and keep things secure.',
          'Provide support and respond to your messages.',
          'Improve and understand product usage.',
          'Comply with applicable legal obligations.',
        ],
      },
      {
        h: 'How we share information',
        p: [
          'We do not sell your personal data. We may share information with providers that help us operate (for example, hosting, authentication and analytics), under agreements that limit their use. On-chain data is public due to the nature of the blockchain. We may also disclose information when required by law or to protect rights and safety.',
        ],
      },
      {
        h: 'Data retention',
        p: [
          'We keep your data while your account is active or as needed to provide the service and meet legal obligations. You can request deletion of your account and associated data by contacting us.',
        ],
      },
      {
        h: 'Security',
        p: [
          'We apply reasonable measures to protect your information. No system is 100% secure, but because GatoPago is non-custodial, your funds stay under your control and not on our servers.',
        ],
      },
      {
        h: 'Your rights',
        p: [
          'You can request to access, correct or delete your personal data. To exercise these rights, contact us at {{privacyEmail}}. Transactions already published on a blockchain remain on that network.',
        ],
      },
      {
        h: 'Children',
        p: [
          'GatoPago is not directed to minors and we do not knowingly collect data from people below the legal age of majority in their jurisdiction.',
        ],
      },
      {
        h: 'Changes to this policy',
        p: [
          'We may update this Privacy Policy. We will post the current version on this page along with its update date.',
        ],
      },
      {
        h: 'Contact',
        p: [
          'If you have questions about this policy or your data, contact us at {{privacyEmail}}.',
        ],
      },
    ],
  },
};
