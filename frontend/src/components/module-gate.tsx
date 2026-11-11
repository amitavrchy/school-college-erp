'use client';
import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
import { useCampus } from './shell';
import { Panel } from './ui';
export function ModuleGate({feature,children}:{feature:string;children:React.ReactNode}){const {features,billing,organization}=useCampus();const expired=!organization?.subscription||new Date(organization.subscription.currentPeriodEnd)<new Date()||organization.status!=='ACTIVE';if(features.includes(feature)&&!expired)return children;return <Panel><div className="empty-state"><LockKeyhole size={32}/><h2>{expired?'Your subscription needs attention.':`Make room for ${feature}.`}</h2><p>{expired?'Renew your subscription to use operational modules. Your core academic records remain available.':`This module is available on plans that include ${feature}.`}</p>{billing?<Link href="/subscription" className="button primary">View subscription plans</Link>:<p>Ask your institution owner to review the subscription.</p>}</div></Panel>;}
