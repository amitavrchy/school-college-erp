export function CampusArt({ className = 'campus-art' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 160" fill="none" aria-hidden="true">
      <circle cx="150" cy="70" r="70" fill="#dbe9d9" />
      <circle cx="232" cy="29" r="10" fill="#ebd9a6" />
      <path d="M17 145h250" stroke="#b7cbb8" strokeWidth="2" strokeLinecap="round" />
      <path d="M65 65h150v80H65z" fill="#d4cbb7" />
      <path d="M59 61h162v11H59z" fill="#c2b59c" />
      <path d="M100 43h80v102h-80z" fill="#f8f5e9" />
      <path d="m93 46 47-29 47 29H93Z" fill="#85a48b" />
      <path d="m103 44 37-22 37 22" stroke="#6c8d75" strokeWidth="3" />
      <circle cx="140" cy="39" r="8" fill="#f7f3e4" />
      <path d="M140 33v7l4 2" stroke="#8aa28b" strokeWidth="1.5" />
      <path d="M127 115a13 13 0 0 1 26 0v30h-26z" fill="#6e8f77" />
      <path d="M139 119v26" stroke="#a7bc9e" strokeWidth="2" />
      {[78, 193].map((x) => (
        <g key={x}>
          {[82, 111].map((y) => (
            <g key={y}>
              <path d={`M${x} ${y}h11v17h-11z`} fill="#90a997" />
              <path d={`M${x + 5.5} ${y}v17M${x} ${y + 7}h11`} stroke="#d8e0ce" />
            </g>
          ))}
        </g>
      ))}
      {[115, 151].map((x) => (
        <g key={x}>
          <path d={`M${x} 65h14v21h-14z`} fill="#9bb3a0" />
          <path d={`M${x + 7} 65v21M${x} 74h14`} stroke="#e7ecdf" />
        </g>
      ))}
      <path d="M140 0v19" stroke="#8da792" strokeWidth="2" />
      <path d="M141 1h20v10h-20" fill="#80a68b" />
      <circle cx="151" cy="6" r="3" fill="#d7a094" />
      <path d="M40 103v42m199-48v48" stroke="#9aaf8c" strokeWidth="3" />
      <ellipse cx="40" cy="98" rx="16" ry="27" fill="#9db994" />
      <ellipse cx="239" cy="91" rx="18" ry="32" fill="#a8c29c" />
      <ellipse cx="26" cy="137" rx="19" ry="8" fill="#b7c9a5" />
      <ellipse cx="251" cy="138" rx="17" ry="7" fill="#b7c9a5" />
      <path d="M119 146h43l9 9h-61z" fill="#c6d4bd" />
      <path d="M122 148h37M117 152h47" stroke="#aebfa8" />
    </svg>
  );
}
