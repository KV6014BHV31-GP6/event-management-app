import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('evaluation', Path(__file__).parents[1]/'evaluate_phase2.py')
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class EvaluationTests(unittest.TestCase):
    def test_sus_standard_anchors(self):
        self.assertEqual(evaluation.sus([5,1]*5), 100)
        self.assertEqual(evaluation.sus([1,5]*5), 0)
        self.assertEqual(evaluation.sus([3]*10), 50)
        self.assertIsNone(evaluation.sus(None))

    def test_sus_rejects_missing_fraction_boolean(self):
        for values in [[3]*9, [3]*9+[True], [3]*9+[2.5], [3]*9+[6]]:
            with self.assertRaises(ValueError):
                evaluation.sus(values)

    def fixture(self):
        return {'kind':'synthetic_pilot','sessions':[{'anonymous_id':'P001','version':'after','role':'leader','language':'ms','device':'Chrome synthetic','sus':None,'tasks':[
            {'task_id':'U1','attempted':True,'result':'success','seconds':12,'seq':None,'errors':[]},
            {'task_id':'U2','attempted':True,'result':'fail','seconds':24,'seq':None,'errors':['validation','navigation']},
            {'task_id':'U3','attempted':False,'result':None,'seconds':None,'seq':None,'errors':[]}]}]}

    def test_denominators_and_missing_ratings(self):
        result = evaluation.usability(self.fixture())
        row = result['groups'][0]
        self.assertEqual((row['attempted_tasks'], row['not_run_tasks']), (2,1))
        self.assertEqual(row['success_rate'], .5)
        self.assertEqual(row['tasks_with_error_rate'], .5)
        self.assertEqual(row['error_events_per_attempt'], 1)
        self.assertEqual(row['median_seconds_success_only'], 12)
        self.assertEqual(row['median_seconds_all_attempts'], 18)
        self.assertIsNone(row['sus_mean'])
        self.assertIsNone(row['seq_mean'])
        self.assertFalse(result['study_verified'])

    def test_human_consent_not_inferred(self):
        data = self.fixture();data['kind']='human_study'
        with self.assertRaises(ValueError):evaluation.usability(data)

    def test_notrun_cannot_invent_ratings(self):
        data=self.fixture();data['sessions'][0]['tasks'][2]['seq']=7
        with self.assertRaises(ValueError):evaluation.usability(data)

    def test_nonfinite_time_rejected(self):
        data=self.fixture();data['sessions'][0]['tasks'][0]['seconds']=float('nan')
        with self.assertRaises(ValueError):evaluation.usability(data)

    def test_unknown_cost_not_zero(self):
        data={'currency':'MYR','monthly_costs':{key:{'amount':None,'basis':'unknown'} for key in evaluation.COSTS},'scenarios':[{'registrations_per_month':100,'variable_cost_per_registration':0,'basis':'synthetic'}]}
        result=evaluation.cost(data)
        self.assertIsNone(result['scenarios'][0]['cost_per_registration'])
        self.assertEqual(result['status'],'COST_BASELINE_INCOMPLETE')
        data['monthly_costs']={key:{'amount':10,'basis':'synthetic','source':'calculator test only'} for key in evaluation.COSTS}
        self.assertEqual(evaluation.cost(data)['scenarios'][0]['cost_per_registration'], .7)

    def test_rejects_nonmonthly_cost_period(self):
        data={'currency':'MYR','period':'year','monthly_costs':{key:{'amount':1200,'basis':'synthetic','source':'annual calculator fixture'} for key in evaluation.COSTS},'scenarios':[{'registrations_per_month':100,'variable_cost_per_registration':0,'basis':'synthetic'}]}
        with self.assertRaises(ValueError):evaluation.cost(data)

    def test_success_timing_has_its_own_denominator(self):
        data=self.fixture()
        data['sessions'][0]['tasks']=[{'task_id':f'U{i+1}','attempted':True,'result':'success' if i<2 else 'fail','seconds':seconds,'seq':None,'errors':[]} for i,seconds in enumerate([12,None,12,12])]
        one=evaluation.usability(data)['groups'][0]
        data['sessions'][0]['tasks'][1]['seconds']=12
        data['sessions'][0]['tasks'][3]['seconds']=None
        two=evaluation.usability(data)['groups'][0]
        self.assertEqual(one.get('timed_success_attempts'),1)
        self.assertEqual(two.get('timed_success_attempts'),2)
        self.assertEqual(one['timed_attempts'],two['timed_attempts'])


if __name__ == '__main__':unittest.main()
