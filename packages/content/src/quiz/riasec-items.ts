import type { RiasecItem } from '@unneet/domain';

/**
 * The 30 items of the O*NET® Mini Interest Profiler (Rounds et al., 2016), in O*NET's suggested
 * presentation order (items cycle R, I, A, S, E, C so the quiz never feels repetitive).
 * Licensed CC BY 4.0 by USDOL/ETA. Wording adapted for UK usage; see ATTRIBUTIONS.
 * https://www.onetcenter.org/dl_files/Mini-IP.pdf (Appendix A)
 */
export const RIASEC_ITEMS: readonly RiasecItem[] = [
  { id: 'ip-01', type: 'R', text: 'Build kitchen cabinets' },
  { id: 'ip-02', type: 'I', text: 'Develop a new medicine' },
  { id: 'ip-03', type: 'A', text: 'Write books or plays' },
  { id: 'ip-04', type: 'S', text: 'Help people with personal or emotional problems' },
  { id: 'ip-05', type: 'E', text: 'Manage a department within a large company' },
  { id: 'ip-06', type: 'C', text: 'Install software across computers on a large network' },
  { id: 'ip-07', type: 'R', text: 'Repair household appliances' },
  { id: 'ip-08', type: 'I', text: 'Study ways to reduce water pollution' },
  { id: 'ip-09', type: 'A', text: 'Compose or arrange music' },
  { id: 'ip-10', type: 'S', text: 'Give career guidance to people' },
  { id: 'ip-11', type: 'E', text: 'Start your own business' },
  { id: 'ip-12', type: 'C', text: 'Operate a calculator' },
  { id: 'ip-13', type: 'R', text: 'Assemble electronic parts' },
  { id: 'ip-14', type: 'I', text: 'Conduct chemical experiments' },
  { id: 'ip-15', type: 'A', text: 'Create special effects for films' },
  { id: 'ip-16', type: 'S', text: 'Perform rehabilitation therapy' },
  { id: 'ip-17', type: 'E', text: 'Negotiate business contracts' },
  { id: 'ip-18', type: 'C', text: 'Keep shipping and receiving records' },
  { id: 'ip-19', type: 'R', text: 'Drive a van or lorry to deliver parcels to offices and homes' },
  { id: 'ip-20', type: 'I', text: 'Examine blood samples using a microscope' },
  { id: 'ip-21', type: 'A', text: 'Paint sets for plays' },
  { id: 'ip-22', type: 'S', text: 'Do volunteer work at a charity' },
  { id: 'ip-23', type: 'E', text: 'Market a new line of clothing' },
  { id: 'ip-24', type: 'C', text: 'Keep track of supplies using a hand-held computer' },
  { id: 'ip-25', type: 'R', text: 'Test the quality of parts before they are sent out' },
  { id: 'ip-26', type: 'I', text: 'Develop a way to better predict the weather' },
  { id: 'ip-27', type: 'A', text: 'Write scripts for films or television shows' },
  { id: 'ip-28', type: 'S', text: 'Teach a secondary school class' },
  { id: 'ip-29', type: 'E', text: 'Sell goods in a department store' },
  { id: 'ip-30', type: 'C', text: 'Stamp, sort and distribute post for an organisation' },
];

export const RIASEC_QUIZ_META = {
  id: 'interests',
  title: 'What do you enjoy?',
  intro:
    'Imagine you could do each job below without worrying about training or pay. How much would you like it? There are no right or wrong answers.',
  estimatedMinutes: 4,
} as const;
